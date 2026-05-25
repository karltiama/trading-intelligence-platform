"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ChartCard } from "@/components/dashboard/chart-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { MarketStateCard } from "@/components/dashboard/market-state-card";
import { MorningRunbookCard } from "@/components/dashboard/morning-runbook-card";
import { TodaysSetups } from "@/components/dashboard/todays-setups";
import { WatchlistTable } from "@/components/dashboard/watchlist-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getMarketSummary,
  getMarketState,
  getPortfolioPositions,
  getPortfolioSummary,
  scanSignals,
  type MarketStateResponse,
  type MarketSummaryItem,
  type PortfolioPosition,
  type PortfolioSummary,
  type ScanSignalsSummary,
} from "@/lib/api";

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export default function DashboardPage(): React.JSX.Element {
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(
    null,
  );
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [marketSummary, setMarketSummary] = useState<MarketSummaryItem[]>([]);
  const [marketState, setMarketState] = useState<MarketStateResponse | null>(null);
  const [scannerSummary, setScannerSummary] = useState<ScanSignalsSummary | null>(null);
  const [isScannerRunning, setIsScannerRunning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** `null` = default to first tracked symbol from market summary. */
  const [chartSymbolSelection, setChartSymbolSelection] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setIsLoading(true);
      setError(null);

      try {
        const [summaryRes, positionsRes, marketRes, marketStateRes] = await Promise.all([
          getPortfolioSummary(),
          getPortfolioPositions(),
          getMarketSummary(),
          getMarketState().catch(() => null),
        ]);
        if (!isMounted) return;
        setPortfolioSummary(summaryRes);
        setPositions(positionsRes);
        setMarketSummary(marketRes);
        setMarketState(marketStateRes);
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load dashboard data from the backend.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  const chartSymbol = useMemo(() => {
    if (marketSummary.length === 0) {
      return "";
    }
    if (chartSymbolSelection === null || chartSymbolSelection.trim() === "") {
      return marketSummary[0].symbol;
    }
    const trimmed = chartSymbolSelection.trim().toUpperCase();
    const match = marketSummary.find(
      (item) => item.symbol.toUpperCase() === trimmed,
    );
    return match ? match.symbol : marketSummary[0].symbol;
  }, [marketSummary, chartSymbolSelection]);

  const openPositions = useMemo(
    () => positions.filter((position) => position.quantity > 0).length,
    [positions],
  );

  const trackedSymbols = useMemo(() => {
    const unique = new Set(marketSummary.map((item) => item.symbol));
    return unique.size;
  }, [marketSummary]);

  const topScannerRows = useMemo(
    () => (scannerSummary?.scanned ?? []).slice(0, 3),
    [scannerSummary],
  );

  async function handleRunScanner() {
    setIsScannerRunning(true);
    setScannerError(null);
    try {
      const response = await scanSignals();
      setScannerSummary(response);
    } catch (err: unknown) {
      setScannerError(
        err instanceof Error ? err.message : "Failed to run trend pullback scanner.",
      );
    } finally {
      setIsScannerRunning(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot of your paper account, watchlist, and active setups.
          </p>
        </div>

        <MorningRunbookCard />
        <MarketStateCard marketState={marketState} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Scanner Snapshot</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleRunScanner()}
                disabled={isScannerRunning}
              >
                {isScannerRunning ? "Scanning..." : "Run Scan"}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/dashboard/signals">View Full Scanner</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Timeframe: 1D · Setup window: 3-10 trading days</p>
            {!scannerSummary ? (
              <p>Run scan to view latest strong/watchlist candidates.</p>
            ) : (
              <>
                <p>
                  Last scan: {new Date(scannerSummary.asOf).toLocaleString()} · Strong{" "}
                  {scannerSummary.summary.strongCount} · Watchlist{" "}
                  {scannerSummary.summary.watchlistCount}
                </p>
                {topScannerRows.length > 0 ? (
                  <ul className="space-y-1 text-foreground">
                    {topScannerRows.map((row) => (
                      <li key={row.symbol}>
                        {row.symbol} · {row.grade} · {row.explanation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No scanner rows returned yet.</p>
                )}
              </>
            )}
            {scannerError ? <p className="text-rose-600">{scannerError}</p> : null}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Card key={`kpi-skeleton-${index}`}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {!isLoading && error ? (
          <Card>
            <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">
              Could not load dashboard data. {error}
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !error ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cash
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {portfolioSummary ? usd(portfolioSummary.cashBalance) : "N/A"}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Equity
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {portfolioSummary ? usd(portfolioSummary.totalEquity) : "N/A"}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Unrealized PnL
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {portfolioSummary ? usd(portfolioSummary.unrealizedPnl) : "N/A"}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open Positions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {openPositions}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tracked Symbols
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {trackedSymbols}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {!isLoading &&
        !error &&
        positions.length === 0 &&
        marketSummary.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No portfolio positions or tracked symbols yet. Place an order or sync
              market data to populate this dashboard.
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard symbol={chartSymbol} />
          </div>
          <InsightsPanel />
        </div>

        <WatchlistTable
          selectedSymbol={chartSymbol}
          onSymbolSelect={setChartSymbolSelection}
        />

        <TodaysSetups />
      </div>
    </div>
  );
}
