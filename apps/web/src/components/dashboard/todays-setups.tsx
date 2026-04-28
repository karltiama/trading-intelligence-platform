"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { listSignals, type SignalItem } from "@/lib/api";
import { cn } from "@/lib/utils";

const confidenceTone = (value: number | null) => {
  if (value === null) {
    return "bg-muted text-muted-foreground";
  }
  if (value >= 75) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (value >= 60) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
};

const fmtMoney = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);

export function TodaysSetups() {
  const [setups, setSetups] = useState<SignalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listSignals({
        status: "ACTIVE",
        strategyName: "TREND_PULLBACK",
      });
      setSetups(rows.slice(0, 6));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load signals.");
      setSetups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const sorted = useMemo(
    () =>
      [...setups].sort((a, b) => {
        const ca = a.confidence ?? 0;
        const cb = b.confidence ?? 0;
        if (cb !== ca) return cb - ca;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [setups],
  );

  return (
    <section aria-labelledby="todays-setups-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2
          id="todays-setups-heading"
          className="text-base font-semibold tracking-tight"
        >
          Today&apos;s Setups
        </h2>
        <span className="text-xs text-muted-foreground">
          {isLoading ? "…" : `${sorted.length} active`}
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading setups from scanner…</p>
      ) : null}

      {!isLoading && error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {!isLoading && !error && sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active signals.{" "}
          <Link href="/dashboard/signals" className="font-medium text-primary hover:underline">
            Run a scan
          </Link>{" "}
          on the Signals page.
        </p>
      ) : null}

      {!isLoading && !error && sorted.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((setup) => (
            <Card key={setup.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Target className="size-4" />
                    </span>
                    <CardTitle>{setup.symbol}</CardTitle>
                  </div>
                  <Badge
                    className={cn("text-xs", confidenceTone(setup.confidence))}
                    variant="outline"
                  >
                    {setup.confidence != null
                      ? `${setup.confidence} conf.`
                      : "Scanner"}
                  </Badge>
                </div>
                <CardDescription>{setup.strategyName.replaceAll("_", " ")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Entry</span>
                    <span className="font-medium tabular-nums">{fmtMoney(setup.entryPrice)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Stop</span>
                    <span className="font-medium tabular-nums">{fmtMoney(setup.stopLoss)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">R:R</span>
                    <span className="font-medium tabular-nums">
                      {setup.riskReward != null ? setup.riskReward.toFixed(2) : "—"}
                    </span>
                  </div>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground line-clamp-3">{setup.reason}</p>
                <Link
                  href={`/dashboard/orders?${new URLSearchParams({
                    symbol: setup.symbol,
                    signalId: setup.id,
                  }).toString()}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Paper trade this setup
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}
