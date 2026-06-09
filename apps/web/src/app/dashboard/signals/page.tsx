"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketStateCard } from "@/components/dashboard/market-state-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addTrackedSymbol,
  executeActiveSignals,
  getMarketState,
  listScanHistory,
  listOrders,
  listSignals,
  scanSignals,
  type MarketStateResponse,
  type OrderListItem,
  type ScanHistoryItem,
  type ScanSignalsSummary,
  type ScannerResultRow,
  type StrategyName,
  type SignalItem,
} from "@/lib/api";

function fmtPrice(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleString();
}

function deriveMainBlocker(reasons: string[]): string {
  const lower = reasons.map((reason) => reason.toLowerCase());
  const trend = lower.find((reason) => reason.includes("trend is weak"));
  if (trend) return "Trend is not strong enough yet.";
  const pullback = lower.find(
    (reason) =>
      reason.includes("pullback") &&
      (reason.includes("outside") || reason.includes("stretched") || reason.includes("no ")),
  );
  if (pullback) return "Pullback quality is not in preferred zone.";
  const momentum = lower.find(
    (reason) =>
      reason.includes("stochastic") &&
      (reason.includes("not reset") || reason.includes("preferred")),
  );
  if (momentum) return "Momentum reset is not confirmed yet.";
  const volume = lower.find(
    (reason) => reason.includes("volume") && reason.includes("below"),
  );
  if (volume) return "Volume confirmation is missing.";
  const risk = lower.find(
    (reason) =>
      reason.includes("risk") && (reason.includes("below") || reason.includes("weak")),
  );
  if (risk) return "Risk profile is not acceptable yet.";
  return "Setup is not fully aligned yet.";
}

function deriveUpgradeCondition(
  mainBlocker: string,
  grade: "STRONG" | "WATCHLIST" | "WEAK" | "IGNORE",
): string {
  if (grade === "STRONG") {
    return "Maintain trend and confirmation conditions to keep READY status.";
  }
  if (mainBlocker.includes("Trend")) {
    return "Upgrade when price reclaims and holds stronger trend structure.";
  }
  if (mainBlocker.includes("Pullback")) {
    return "Upgrade when pullback returns to preferred zone and stabilizes.";
  }
  if (mainBlocker.includes("Momentum")) {
    return "Upgrade when momentum reset/turn confirms.";
  }
  if (mainBlocker.includes("Volume")) {
    return "Upgrade when volume confirms relative to baseline.";
  }
  if (mainBlocker.includes("Risk")) {
    return "Upgrade when stop/target structure improves risk profile.";
  }
  return "Upgrade when core trend, pullback, and confirmation conditions align.";
}

function scannerGradeBadgeClass(
  grade: "STRONG" | "WATCHLIST" | "WEAK" | "IGNORE",
): string {
  if (grade === "STRONG") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (grade === "WATCHLIST") {
    return "border-slate-300 bg-slate-100 text-slate-900";
  }
  if (grade === "WEAK") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  return "border-rose-300 bg-rose-50 text-rose-900";
}

function marketStateStrategyHint(
  marketState: MarketStateResponse | null,
  strategy: StrategyName,
): string | null {
  if (!marketState) {
    return null;
  }
  const guidance =
    strategy === "TREND_PULLBACK"
      ? marketState.strategyGuidance.trendPullback
      : strategy === "RELATIVE_STRENGTH_BREAKOUT"
        ? marketState.strategyGuidance.relativeStrengthBreakout
        : marketState.strategyGuidance.oversoldBounce;

  if (guidance === "FAVORABLE") {
    return `Current market state (${marketState.label}) is supportive for ${strategy.toLowerCase().replaceAll("_", " ")} setups.`;
  }
  if (guidance === "UNFAVORABLE") {
    return `Current market state favors other setup types more than ${strategy.toLowerCase().replaceAll("_", " ")} setups.`;
  }
  return `Current market state is mixed for ${strategy.toLowerCase().replaceAll("_", " ")} setups.`;
}

export default function SignalsPage(): React.JSX.Element {
  const [selectedStrategy, setSelectedStrategy] =
    useState<StrategyName>("TREND_PULLBACK");
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [scanSummary, setScanSummary] = useState<ScanSignalsSummary | null>(null);
  const [marketState, setMarketState] = useState<MarketStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [quantityPerSignal, setQuantityPerSignal] = useState("1");
  const [executeMessage, setExecuteMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [watchlistBusyBySymbol, setWatchlistBusyBySymbol] = useState<
    Record<string, boolean>
  >({});
  const [watchlistMessageBySymbol, setWatchlistMessageBySymbol] = useState<
    Record<string, string>
  >({});
  const [alertMessageBySymbol, setAlertMessageBySymbol] = useState<
    Record<string, string>
  >({});

  const loadSignals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listSignals({
        status: "ACTIVE",
        strategyName: selectedStrategy,
      });
      setSignals(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load signals.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedStrategy]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSignals();
    });
  }, [loadSignals]);

  useEffect(() => {
    queueMicrotask(() => {
      void listScanHistory({ strategyName: selectedStrategy, limit: 10 })
        .then(setScanHistory)
        .catch(() => setScanHistory([]));
    });
  }, [selectedStrategy]);

  useEffect(() => {
    queueMicrotask(() => {
      void listOrders({ limit: 100 })
        .then(setOrders)
        .catch(() => setOrders([]));
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void getMarketState()
        .then(setMarketState)
        .catch(() => setMarketState(null));
    });
  }, []);

  const ordersBySignalId = useMemo(() => {
    const map = new Map<string, OrderListItem[]>();
    for (const order of orders) {
      if (!order.signalId) continue;
      if (order.source !== "SIGNAL" && order.source !== "AUTOMATION") continue;
      const list = map.get(order.signalId) ?? [];
      list.push(order);
      map.set(order.signalId, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
      );
    }
    return map;
  }, [orders]);

  const sortedSignals = useMemo(
    () =>
      [...signals].sort((a, b) => {
        const confidenceA = a.confidence ?? 0;
        const confidenceB = b.confidence ?? 0;
        if (confidenceB !== confidenceA) return confidenceB - confidenceA;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [signals],
  );
  const rankedScanRows = useMemo<ScannerResultRow[]>(
    () => scanSummary?.scanned ?? [],
    [scanSummary],
  );

  async function handleScan() {
    setIsScanning(true);
    setError(null);
    setExecuteMessage(null);
    try {
      const summary = await scanSignals(selectedStrategy);
      setScanSummary(summary);
      await loadSignals();
      try {
        setOrders(await listOrders({ limit: 100 }));
      } catch {
        setOrders([]);
      }
      try {
        setScanHistory(
          await listScanHistory({ strategyName: selectedStrategy, limit: 10 }),
        );
      } catch {
        setScanHistory([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to run signal scan.");
    } finally {
      setIsScanning(false);
    }
  }

  const strategyLabel =
    selectedStrategy === "TREND_PULLBACK"
      ? "Trend Pullback"
      : selectedStrategy === "RELATIVE_STRENGTH_BREAKOUT"
        ? "Relative Strength Breakout"
        : "Oversold Bounce";

  async function handleExecuteActiveSignals() {
    if (sortedSignals.length === 0) {
      return;
    }

    const quantity = Number(quantityPerSignal);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Quantity per signal must be a positive whole number.");
      return;
    }

    const guidanceHint = marketStateStrategyHint(marketState, selectedStrategy);
    const confirmed = window.confirm(
      [
        `Execute ${sortedSignals.length} active ${strategyLabel} signal(s)?`,
        `Each order: BUY ${quantity} share(s) via paper trading.`,
        guidanceHint ?? "",
        "Proceed?",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    if (!confirmed) {
      return;
    }

    setIsExecuting(true);
    setError(null);
    setExecuteMessage(null);
    try {
      const result = await executeActiveSignals({
        strategyName: selectedStrategy,
        quantityPerSignal: quantity,
        signalIds: sortedSignals.map((signal) => signal.id),
      });
      setExecuteMessage(
        `Automation run ${result.runId.slice(0, 8)}…: placed ${result.placed}/${result.totalSignals}, ` +
          `risk rejected ${result.rejectedRisk}, failed ${result.failed}.`,
      );
      try {
        setOrders(await listOrders({ limit: 100 }));
      } catch {
        setOrders([]);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to execute active signals.",
      );
    } finally {
      setIsExecuting(false);
    }
  }

  async function handleAddToWatchlist(symbol: string) {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      return;
    }
    setWatchlistBusyBySymbol((prev) => ({ ...prev, [ticker]: true }));
    setWatchlistMessageBySymbol((prev) => ({ ...prev, [ticker]: "" }));
    try {
      await addTrackedSymbol(ticker);
      setWatchlistMessageBySymbol((prev) => ({
        ...prev,
        [ticker]: "Added to watchlist.",
      }));
    } catch (err: unknown) {
      setWatchlistMessageBySymbol((prev) => ({
        ...prev,
        [ticker]:
          err instanceof Error ? err.message : "Could not add to watchlist.",
      }));
    } finally {
      setWatchlistBusyBySymbol((prev) => ({ ...prev, [ticker]: false }));
    }
  }

  function handleSetAlert(symbol: string) {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      return;
    }
    setAlertMessageBySymbol((prev) => ({
      ...prev,
      [ticker]: "Alert setup coming soon.",
    }));
  }

  return (
    <div className="flex min-h-svh flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Signals</h1>
        <p className="text-sm text-muted-foreground">
          Scan tracked symbols for selected scanner setups and review trade context.
        </p>
        <p className="text-xs text-muted-foreground">
          Scanning Core Universe ({scanSummary?.scannedSymbols ?? "..."})
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle className="text-base">{strategyLabel} Scanner</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={
                  selectedStrategy === "TREND_PULLBACK" ? "default" : "outline"
                }
                size="sm"
                onClick={() => setSelectedStrategy("TREND_PULLBACK")}
              >
                Trend Pullback
              </Button>
              <Button
                variant={
                  selectedStrategy === "RELATIVE_STRENGTH_BREAKOUT"
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() =>
                  setSelectedStrategy("RELATIVE_STRENGTH_BREAKOUT")
                }
              >
                Relative Strength Breakout
              </Button>
              <Button
                variant={
                  selectedStrategy === "OVERSOLD_BOUNCE" ? "default" : "outline"
                }
                size="sm"
                onClick={() => setSelectedStrategy("OVERSOLD_BOUNCE")}
              >
                Oversold Bounce
              </Button>
            </div>
          </div>
          <Button onClick={() => void handleScan()} disabled={isScanning}>
            {isScanning ? "Scanning..." : "Run Scan"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Strategy checks are scanner-specific and use deterministic grading with
            qualitative reasons.
          </p>
          <p className="text-xs">
            Timeframe: 1D · Setup window: 3-10 trading days
          </p>
          {scanSummary ? (
            <div className="rounded-md border p-3 text-foreground">
              Scan completed at {fmtDate(scanSummary.asOf)}. Scanned {scanSummary.scannedSymbols} symbols, qualified{" "}
              {scanSummary.qualifiedSignals}, upserted {scanSummary.upsertedSignals}, expired{" "}
              {scanSummary.expiredSignals}, skipped {scanSummary.skippedSymbols}.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <MarketStateCard marketState={marketState} title="Market State Context" />

      {scanSummary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scanner V2 Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Total scanned</p>
                <p className="text-lg font-semibold">{scanSummary.summary.totalScanned}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Strong setups</p>
                <p className="text-lg font-semibold">{scanSummary.summary.strongCount}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Watchlist setups</p>
                <p className="text-lg font-semibold">{scanSummary.summary.watchlistCount}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Weak / ignored</p>
                <p className="text-lg font-semibold">
                  {scanSummary.summary.weakCount + scanSummary.summary.ignoreCount}
                </p>
              </div>
            </div>
            {scanSummary.summary.strongCount === 0 ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                No strong {strategyLabel.toLowerCase()} setups found.{" "}
                {marketStateStrategyHint(marketState, selectedStrategy) ??
                  "Showing highest-ranked watchlist candidates."}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Runs (History)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {scanHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scan history yet for this strategy.
            </p>
          ) : null}
          {scanHistory.map((run) => (
            <div key={run.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{fmtDate(run.createdAt)}</p>
                <Badge variant="outline">{run.strategyName}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-5">
                <p>Scanned: {run.scannedSymbols}</p>
                <p>Strong: {run.summary.strongCount}</p>
                <p>Watchlist: {run.summary.watchlistCount}</p>
                <p>Weak: {run.summary.weakCount}</p>
                <p>Ignored: {run.summary.ignoreCount}</p>
              </div>
              {run.blockerCounts.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground">Top blockers</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {run.blockerCounts.slice(0, 3).map((item) => (
                      <li key={`${run.id}-${item.reason}`}>
                        {item.reason} ({item.count})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranked Scanner Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!scanSummary ? (
            <p className="text-sm text-muted-foreground">
              Run scan to see ranked diagnostics for every symbol.
            </p>
          ) : null}
          {scanSummary && rankedScanRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No ranked rows returned. Try running scan again.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {rankedScanRows.slice(0, 50).map((row) => {
              const mainBlocker = deriveMainBlocker(row.reasons);
              const upgradeCondition = deriveUpgradeCondition(
                mainBlocker,
                row.grade,
              );
              return (
              <div key={row.symbol} className="h-full rounded-md border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{row.symbol}</span>
                  <Badge
                    variant="outline"
                    className={scannerGradeBadgeClass(row.grade)}
                  >
                    {row.grade}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{row.explanation}</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>
                    As of scan:{" "}
                    {scanSummary?.asOf ? fmtDate(scanSummary.asOf) : "—"}
                  </p>
                  <p>Setup window: 3-10 trading days</p>
                  <p>Main blocker: {mainBlocker}</p>
                  <p>Upgrade condition: {upgradeCondition}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.tags.slice(0, 4).map((tag) => (
                    <Badge key={`${row.symbol}-${tag}`} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {row.reasons.slice(0, 4).map((reason) => (
                    <li key={`${row.symbol}-${reason}`}>{reason}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {row.grade === "STRONG" ? (
                    <Button size="sm" asChild>
                      <Link
                        href={`/dashboard/orders?${new URLSearchParams({
                          symbol: row.symbol,
                        }).toString()}`}
                      >
                        Trade
                      </Link>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      href={`/dashboard/orders?${new URLSearchParams({
                        symbol: row.symbol,
                      }).toString()}`}
                    >
                      View Chart
                    </Link>
                  </Button>
                  {(row.grade === "STRONG" || row.grade === "WATCHLIST") ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(watchlistBusyBySymbol[row.symbol])}
                      onClick={() => void handleAddToWatchlist(row.symbol)}
                    >
                      {watchlistBusyBySymbol[row.symbol]
                        ? "Adding..."
                        : "Add to Watchlist"}
                    </Button>
                  ) : null}
                  {row.grade === "WATCHLIST" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetAlert(row.symbol)}
                    >
                      Set Alert
                    </Button>
                  ) : null}
                </div>
                {watchlistMessageBySymbol[row.symbol] ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {watchlistMessageBySymbol[row.symbol]}
                  </p>
                ) : null}
                {alertMessageBySymbol[row.symbol] ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {alertMessageBySymbol[row.symbol]}
                  </p>
                ) : null}
              </div>
            );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Active Signals</CardTitle>
          {!isLoading && sortedSignals.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Qty each
                <Input
                  type="number"
                  min={1}
                  step={1}
                  className="h-8 w-20"
                  value={quantityPerSignal}
                  onChange={(event) => setQuantityPerSignal(event.target.value)}
                  disabled={isExecuting}
                />
              </label>
              <Button
                size="sm"
                onClick={() => void handleExecuteActiveSignals()}
                disabled={isExecuting}
              >
                {isExecuting
                  ? "Executing..."
                  : `Execute ${sortedSignals.length} Signal${sortedSignals.length === 1 ? "" : "s"}`}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/dashboard/automation">View runs</Link>
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {executeMessage ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
              {executeMessage}
            </p>
          ) : null}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading signals...</p>
          ) : null}

          {!isLoading && sortedSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active {strategyLabel.toLowerCase()} signals yet. Run scan to generate candidates.
            </p>
          ) : null}

          {!isLoading &&
            sortedSignals.map((signal) => {
              const linked = ordersBySignalId.get(signal.id) ?? [];
              return (
              <div key={signal.id} className="rounded-md border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{signal.symbol}</span>
                  <Badge variant="outline">{signal.strategyName}</Badge>
                  <Badge>{signal.status}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Confidence: {signal.confidence ?? "-"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                  <p>Entry: {fmtPrice(signal.entryPrice)}</p>
                  <p>Stop: {fmtPrice(signal.stopLoss)}</p>
                  <p>Target: {fmtPrice(signal.targetPrice)}</p>
                  <p>Risk/Reward: {signal.riskReward ? signal.riskReward.toFixed(2) : "-"}</p>
                  <p>Time horizon: {signal.timeHorizon ?? "-"}</p>
                  <p>Signal date: {fmtDate(signal.signalDate)}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{signal.reason}</p>
                {linked.length > 0 ? (
                  <div className="mt-3 rounded-md border border-dashed bg-muted/20 p-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Linked paper orders
                    </p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {linked.map((o) => (
                        <li key={o.orderId}>
                          {fmtDate(o.requestedAt)} · {o.side} {o.quantity} ·{" "}
                          <span className="font-medium">{o.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-3">
                  <Link
                    href={`/dashboard/orders?${new URLSearchParams({
                      symbol: signal.symbol,
                      signalId: signal.id,
                    }).toString()}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Go to paper trade
                  </Link>
                </div>
              </div>
            );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
