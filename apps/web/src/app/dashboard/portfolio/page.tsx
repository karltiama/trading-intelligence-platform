"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getPortfolio,
  getPortfolioHistory,
  type PortfolioSnapshot,
  type PortfolioSummary,
  type PortfolioPosition,
} from "@/lib/api";
import { formatMarkAsOf, isUsMarketSessionOpen } from "@/lib/market-session";
import { fmtPct, fmtUsd, pctGainClass } from "@/lib/order-levels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function formatSnapshotDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PortfolioPage(): React.JSX.Element {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPortfolio = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [portfolio, historyRows] = await Promise.all([
        getPortfolio(),
        getPortfolioHistory(30),
      ]);
      setSummary(portfolio.summary);
      setPositions(portfolio.positions);
      setHistory(historyRows);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load portfolio data.",
      );
      if (!options?.silent) {
        setSummary(null);
        setPositions([]);
        setHistory([]);
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    if (!isUsMarketSessionOpen()) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void loadPortfolio({ silent: true });
    }, 60_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadPortfolio]);

  const sortedPositions = useMemo(
    () =>
      [...positions].sort(
        (a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0),
      ),
    [positions],
  );

  const dailyEquityChange = useMemo(() => {
    if (history.length < 2) {
      return null;
    }
    return history[0].totalEquity - history[1].totalEquity;
  }, [history]);

  return (
    <div className="flex min-h-svh flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Live paper account equity, open positions, and daily snapshots.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadPortfolio()} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Loading portfolio...
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && error ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total equity
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {fmtUsd(summary.totalEquity)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total return
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  pctGainClass(summary.totalReturn),
                )}
              >
                {fmtUsd(summary.totalReturn)}
                <span className="ml-2 text-base font-medium">
                  {fmtPct(summary.totalReturnPct)}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Unrealized P&amp;L
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  pctGainClass(summary.unrealizedPnl),
                )}
              >
                {fmtUsd(summary.unrealizedPnl)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Realized P&amp;L
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  pctGainClass(summary.realizedPnl),
                )}
              >
                {fmtUsd(summary.realizedPnl)}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cash
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {fmtUsd(summary.cashBalance)}
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtPct(summary.cashPct)} of equity
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Invested
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {fmtUsd(summary.positionsValue)}
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtPct(summary.investedPct)} of equity
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open positions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {summary.positionCount}
                {summary.positionsWithoutStop > 0 ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    {summary.positionsWithoutStop} without stop
                  </p>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Daily equity change
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "text-xl font-semibold",
                  pctGainClass(dailyEquityChange),
                )}
              >
                {dailyEquityChange === null ? "—" : fmtUsd(dailyEquityChange)}
                <p className="mt-1 text-xs text-muted-foreground">
                  vs prior snapshot
                </p>
              </CardContent>
            </Card>
          </div>

          {summary.asOf ? (
            <p className="text-xs text-muted-foreground">
              Marks as of {formatMarkAsOf(summary.asOf)}
              {isUsMarketSessionOpen() ? " · refreshes every 60s during market hours" : ""}
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open positions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sortedPositions.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No open positions.{" "}
                  <Link href="/dashboard/orders" className="underline">
                    Place a paper order
                  </Link>{" "}
                  to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Symbol</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">Avg cost</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Gain</TableHead>
                        <TableHead className="text-right">Unrealized</TableHead>
                        <TableHead className="text-right">Days held</TableHead>
                        <TableHead className="pr-4 text-right">Stop</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPositions.map((position) => (
                        <TableRow key={position.symbol}>
                          <TableCell className="pl-4 font-medium">
                            {position.symbol}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {position.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtPct(position.weightPct)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtUsd(position.averageCost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div>{fmtUsd(position.currentPrice)}</div>
                            {position.asOf ? (
                              <div className="text-xs text-muted-foreground">
                                {formatMarkAsOf(position.asOf)}
                                {position.priceSource
                                  ? ` · ${position.priceSource}`
                                  : ""}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums font-medium",
                              pctGainClass(position.pctGain),
                            )}
                          >
                            {fmtPct(position.pctGain)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums",
                              pctGainClass(position.unrealizedPnl),
                            )}
                          >
                            {fmtUsd(position.unrealizedPnl)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {position.daysHeld ?? "—"}
                          </TableCell>
                          <TableCell className="pr-4 text-right tabular-nums text-rose-700 dark:text-rose-400">
                            {fmtUsd(position.stopLossPrice)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portfolio history</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No snapshots yet. History is recorded when you load portfolio data.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">As of</TableHead>
                        <TableHead className="text-right">Equity</TableHead>
                        <TableHead className="text-right">Cash</TableHead>
                        <TableHead className="text-right">Invested</TableHead>
                        <TableHead className="text-right">Unrealized</TableHead>
                        <TableHead className="pr-4 text-right">Realized</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((row) => (
                        <TableRow key={row.asOf}>
                          <TableCell className="pl-4 text-muted-foreground">
                            {formatSnapshotDate(row.asOf)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {fmtUsd(row.totalEquity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtUsd(row.cashBalance)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtUsd(row.positionsValue)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums",
                              pctGainClass(row.unrealizedPnl),
                            )}
                          >
                            {fmtUsd(row.unrealizedPnl)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "pr-4 text-right tabular-nums",
                              pctGainClass(row.realizedPnl),
                            )}
                          >
                            {fmtUsd(row.realizedPnl)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
