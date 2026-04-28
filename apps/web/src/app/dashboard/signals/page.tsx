"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listOrders,
  listSignals,
  scanSignals,
  type OrderListItem,
  type ScanSignalsSummary,
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

export default function SignalsPage(): React.JSX.Element {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [scanSummary, setScanSummary] = useState<ScanSignalsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          {scanSummary ? (
            <div className="rounded-md border p-3 text-foreground">
              Scan completed at {fmtDate(scanSummary.asOf)}. Scanned {scanSummary.scannedSymbols} symbols, qualified{" "}
              {scanSummary.qualifiedSignals}, upserted {scanSummary.upsertedSignals}, expired{" "}
              {scanSummary.expiredSignals}, skipped {scanSummary.skippedSymbols}.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

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
