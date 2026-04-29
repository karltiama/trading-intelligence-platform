"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addTrackedSymbol,
  listOrders,
  listSignals,
  scanSignals,
  type OrderListItem,
  type ScanSignalsSummary,
  type ScannerResultRow,
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

function deriveUpgradeCondition(mainBlocker: string, grade: "READY" | "WATCHLIST" | "NOT_READY"): string {
  if (grade === "READY") {
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

export default function SignalsPage(): React.JSX.Element {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [scanSummary, setScanSummary] = useState<ScanSignalsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        strategyName: "TREND_PULLBACK",
      });
      setSignals(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load signals.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSignals();
    });
  }, [loadSignals]);

  useEffect(() => {
    queueMicrotask(() => {
      void listOrders({ limit: 100 })
        .then(setOrders)
        .catch(() => setOrders([]));
    });
  }, []);

  const ordersBySignalId = useMemo(() => {
    const map = new Map<string, OrderListItem[]>();
    for (const order of orders) {
      if (!order.signalId || order.source !== "SIGNAL") continue;
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
    try {
      const summary = await scanSignals();
      setScanSummary(summary);
      await loadSignals();
      try {
        setOrders(await listOrders({ limit: 100 }));
      } catch {
        setOrders([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to run signal scan.");
    } finally {
      setIsScanning(false);
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
          Scan tracked symbols for trend pullback setups and review trade context.
        </p>
        <p className="text-xs text-muted-foreground">
          Scanning Core Universe ({scanSummary?.scannedSymbols ?? "..."})
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Trend Pullback Scanner</CardTitle>
          <Button onClick={() => void handleScan()} disabled={isScanning}>
            {isScanning ? "Scanning..." : "Run Scan"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Strategy checks: close above SMA 50/200, near SMA 20, RSI reset (40-60),
            healthy relative volume, and acceptable risk/reward.
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
                No perfect setups today. Showing highest-ranked watchlist candidates.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
                row.presentation.grade,
              );
              return (
              <div key={row.symbol} className="h-full rounded-md border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{row.symbol}</span>
                  <Badge
                    variant="outline"
                    className={scannerGradeBadgeClass(
                      row.presentation.grade === "READY"
                        ? "STRONG"
                        : row.presentation.grade === "WATCHLIST"
                          ? "WATCHLIST"
                          : "IGNORE",
                    )}
                  >
                    {row.presentation.grade}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{row.presentation.explanation}</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>
                    As of scan:{" "}
                    {scanSummary?.asOf ? fmtDate(scanSummary.asOf) : "—"}
                  </p>
                  <p>Setup window: {row.timeHorizon ?? "3-10 trading days"}</p>
                  <p>Main blocker: {mainBlocker}</p>
                  <p>Upgrade condition: {upgradeCondition}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.presentation.tags.slice(0, 4).map((tag) => (
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
                  {row.presentation.grade === "READY" ? (
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
                  {row.presentation.grade !== "NOT_READY" ? (
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
                  {row.presentation.grade === "WATCHLIST" ? (
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
        <CardHeader>
          <CardTitle className="text-base">Active Signals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading signals...</p>
          ) : null}

          {!isLoading && sortedSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active trend pullback signals yet. Run scan to generate candidates.
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
