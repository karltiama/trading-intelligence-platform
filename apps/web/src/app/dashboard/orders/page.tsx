"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  cancelOrder,
  getPortfolioPositions,
  getSignalById,
  getStopLossSuggestion,
  listTrackedSymbols,
  listOrders,
  placeOrder,
  updateOrderLevels,
  type OrderListItem,
  type OrderSide,
  type PortfolioPosition,
  type SignalItem,
  type TrackedSymbolRow,
  type TradeSource,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PositionActionButtons } from "@/components/dashboard/position-action-buttons";
import { TradingViewSymbolChart } from "@/components/dashboard/tradingview-symbol-chart";
import { resolveOrderStop, resolveOrderTarget, fmtPct, pctGainClass } from "@/lib/order-levels";
import { formatMarkAsOf, isUsMarketSessionOpen } from "@/lib/market-session";
import { cn } from "@/lib/utils";

const UI_ASSUMED_EQUITY = 100000;
const STOP_PRESET_PERCENTS = [0.01, 0.02, 0.05] as const;
const TAKE_PROFIT_PRESET_PERCENTS = [0.01, 0.02, 0.05] as const;
const MAX_DEFAULT_STOP_DISTANCE = 0.08;
const FALLBACK_DEFAULT_STOP_DISTANCE = 0.02;

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function fmtUsd(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function statusVariant(
  status: OrderListItem["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "FILLED") return "default";
  if (status === "CANCELED") return "secondary";
  return "outline";
}

function sourceBadgeClass(source: TradeSource): string {
  if (source === "SIGNAL") return "border-emerald-600/40 text-emerald-700 dark:text-emerald-400";
  if (source === "AUTOMATION") return "border-violet-600/40 text-violet-700 dark:text-violet-400";
  return "text-muted-foreground";
}

function universeBadgeClass(universeType: "CORE" | "ON_DEMAND"): string {
  if (universeType === "CORE") {
    return "border-sky-600/40 text-sky-700 dark:text-sky-400";
  }
  return "border-amber-600/40 text-amber-700 dark:text-amber-400";
}

function formatStrategyLabel(strategyName: string | null): string | null {
  if (!strategyName) return null;
  if (strategyName === "TREND_PULLBACK") return "Trend Pullback";
  if (strategyName === "RELATIVE_STRENGTH_BREAKOUT") {
    return "Relative Strength Breakout";
  }
  if (strategyName === "OVERSOLD_BOUNCE") return "Oversold Bounce";
  return strategyName.replaceAll("_", " ");
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

type TradeMode = "manual" | "signal";

type OrdersPageContentProps = {
  initialSymbol: string;
  initialSignalId: string;
};

function OrdersPageContent({
  initialSymbol,
  initialSignalId,
}: OrdersPageContentProps): React.JSX.Element {
  const [tradeMode, setTradeMode] = useState<TradeMode>(() =>
    initialSignalId.trim() ? "signal" : "manual",
  );
  const [symbol, setSymbol] = useState(() => initialSymbol.trim().toUpperCase());
  const [quantity, setQuantity] = useState("1");
  const [side, setSide] = useState<OrderSide>("BUY");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [referencePrice, setReferencePrice] = useState<number | null>(null);
  const [stopConfirmed, setStopConfirmed] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [orderNote, setOrderNote] = useState("");
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signalContext, setSignalContext] = useState<SignalItem | null>(null);
  const [signalLoadError, setSignalLoadError] = useState<string | null>(null);
  const [isLoadingSignal, setIsLoadingSignal] = useState(false);
  const [linkedOrders, setLinkedOrders] = useState<OrderListItem[]>([]);
  const [isLoadingLinked, setIsLoadingLinked] = useState(false);
  const [trackedSymbols, setTrackedSymbols] = useState<TrackedSymbolRow[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(true);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingSymbol, setEditingSymbol] = useState("");
  const [editStop, setEditStop] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [isSavingLevels, setIsSavingLevels] = useState(false);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  useEffect(() => {
    if (!initialSignalId) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setIsLoadingSignal(true);
      setSignalLoadError(null);
    });

    void getSignalById(initialSignalId)
      .then((row) => {
        if (!cancelled) {
          setSignalContext(row);
          setSymbol(row.symbol.toUpperCase());
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSignalContext(null);
          setSignalLoadError(
            err instanceof Error ? err.message : "Could not load signal details.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSignal(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialSignalId]);

  useEffect(() => {
    const targetSymbol = symbol.trim().toUpperCase();
    if (!targetSymbol) {
      setReferencePrice(null);
      setSuggestionMessage(null);
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      void getStopLossSuggestion(targetSymbol, 20)
        .then((suggestion) => {
          if (cancelled) return;
          const effectiveReference =
            signalContext?.entryPrice ?? suggestion.referencePrice;
          const maxDistanceStop =
            effectiveReference * (1 - MAX_DEFAULT_STOP_DISTANCE);
          let nextStop = suggestion.suggestedStopLoss;
          let message = `Suggested stop from recent swing low: ${fmtUsd(
            suggestion.suggestedStopLoss,
          )}`;
          if (nextStop < maxDistanceStop) {
            nextStop = effectiveReference * (1 - FALLBACK_DEFAULT_STOP_DISTANCE);
            message = `Adjusted default stop to ${fmtUsd(
              nextStop,
            )} (2% below reference) because historical swing low was too far from current price.`;
          }
          setReferencePrice(effectiveReference);
          setStopLossPrice(nextStop.toFixed(2));
          setStopConfirmed(false);
          setSuggestionMessage(message);
        })
        .catch(() => {
          if (cancelled) return;
          if (signalContext?.entryPrice != null) {
            const fallbackStop =
              signalContext.entryPrice * (1 - FALLBACK_DEFAULT_STOP_DISTANCE);
            setReferencePrice(signalContext.entryPrice);
            setStopLossPrice(fallbackStop.toFixed(2));
            setSuggestionMessage(
              `Using fallback stop: ${fmtUsd(
                fallbackStop,
              )} (2% below reference).`,
            );
          } else {
            setReferencePrice(null);
            setSuggestionMessage('Could not load stop suggestion for this symbol.');
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [signalContext?.entryPrice, symbol]);

  useEffect(() => {
    if (signalContext?.entryPrice != null) {
      setReferencePrice(signalContext.entryPrice);
    }
  }, [signalContext]);

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
      ),
    [orders],
  );

  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const rows = await listOrders();
      setOrders(rows);
      setError(null);
    } catch {
      setOrders([]);
      setError(null);
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  const loadPositions = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoadingPositions(true);
    }
    try {
      const rows = await getPortfolioPositions();
      setPositions(rows);
    } catch {
      if (!options?.silent) {
        setPositions([]);
      }
    } finally {
      if (!options?.silent) {
        setIsLoadingPositions(false);
      }
    }
  }, []);

  const refreshTradingData = useCallback(async () => {
    await Promise.all([loadOrders(), loadPositions()]);
  }, [loadOrders, loadPositions]);

  const loadLinkedOrders = useCallback(async () => {
    if (!initialSignalId.trim()) {
      setLinkedOrders([]);
      return;
    }
    setIsLoadingLinked(true);
    try {
      const rows = await listOrders({ signalId: initialSignalId.trim(), limit: 25 });
      setLinkedOrders(rows.filter((o) => o.source === "SIGNAL"));
    } catch {
      setLinkedOrders([]);
    } finally {
      setIsLoadingLinked(false);
    }
  }, [initialSignalId]);

  const loadTrackedSymbols = useCallback(async () => {
    setIsLoadingSymbols(true);
    try {
      const rows = await listTrackedSymbols();
      setTrackedSymbols(rows);
    } catch {
      setTrackedSymbols([]);
    } finally {
      setIsLoadingSymbols(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshTradingData();
    });
  }, [refreshTradingData]);

  useEffect(() => {
    if (!isUsMarketSessionOpen()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadPositions({ silent: true });
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadPositions]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLinkedOrders();
    });
  }, [loadLinkedOrders]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTrackedSymbols();
    });
  }, [loadTrackedSymbols]);

  function startEditingLevels(input: {
    orderId: string;
    symbol: string;
    stop: number | null;
    target: number | null;
  }) {
    setEditingOrderId(input.orderId);
    setEditingSymbol(input.symbol);
    setEditStop(input.stop != null ? input.stop.toFixed(2) : "");
    setEditTarget(input.target != null ? input.target.toFixed(2) : "");
    setError(null);
    setMessage(null);
  }

  function cancelEditingLevels() {
    setEditingOrderId(null);
    setEditingSymbol("");
    setEditStop("");
    setEditTarget("");
  }

  async function handleSaveLevels() {
    if (!editingOrderId) {
      return;
    }
    const stopValue = Number(editStop);
    if (!Number.isFinite(stopValue) || stopValue <= 0) {
      setError("Stop loss must be a positive number.");
      return;
    }
    const targetRaw = editTarget.trim();
    const targetValue =
      targetRaw.length > 0 ? Number(targetRaw) : undefined;
    if (targetValue !== undefined && (!Number.isFinite(targetValue) || targetValue <= 0)) {
      setError("Target must be a positive number when provided.");
      return;
    }

    setIsSavingLevels(true);
    setError(null);
    setMessage(null);
    try {
      await updateOrderLevels(editingOrderId, {
        stopLossPrice: stopValue,
        takeProfitPrice: targetValue,
      });
      setMessage(`Updated stop/target for ${editingSymbol}.`);
      cancelEditingLevels();
      await refreshTradingData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update order levels.",
      );
    } finally {
      setIsSavingLevels(false);
    }
  }

  const sortedPositions = useMemo(
    () =>
      [...positions].sort((a, b) => {
        const gainA = a.pctGain ?? 0;
        const gainB = b.pctGain ?? 0;
        if (gainB !== gainA) return gainB - gainA;
        return a.symbol.localeCompare(b.symbol);
      }),
    [positions],
  );

  const activeTrackedSymbols = useMemo(
    () => trackedSymbols.filter((row) => row.isActive),
    [trackedSymbols],
  );
  const isManualSymbolValid = useMemo(
    () => activeTrackedSymbols.some((row) => row.ticker === symbol.trim().toUpperCase()),
    [activeTrackedSymbols, symbol],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    if (tradeMode === "signal" && !initialSignalId.trim()) {
      setError("Open a setup from the Signals page to use signal mode.");
      setIsSubmitting(false);
      return;
    }

    try {
      const parsedQty = Number(quantity);
      const sym = symbol.trim().toUpperCase();
      const noteTrim = orderNote.trim() || undefined;
      const stopLossValue = Number(stopLossPrice);
      const takeProfitValue =
        takeProfitPrice.trim().length > 0 ? Number(takeProfitPrice) : undefined;

      if (tradeMode === "signal") {
        await placeOrder({
          symbol: sym,
          side,
          quantity: parsedQty,
          stopLossPrice: stopLossValue,
          takeProfitPrice: takeProfitValue,
          source: "SIGNAL",
          signalId: initialSignalId.trim(),
          note: noteTrim,
        });
      } else {
        await placeOrder({
          symbol: sym,
          side,
          quantity: parsedQty,
          stopLossPrice: stopLossValue,
          takeProfitPrice: takeProfitValue,
          source: "MANUAL",
          note: noteTrim,
        });
      }
      setMessage("Order submitted successfully.");
      await refreshTradingData();
      await loadLinkedOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to place order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(orderId: string) {
    setError(null);
    setMessage(null);
    try {
      await cancelOrder(orderId);
      setMessage(`Canceled order ${orderId}.`);
      await refreshTradingData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel order.");
    }
  }

  const decisionTitle = signalContext
    ? `${signalContext.strategyName} · ${signalContext.symbol}`
    : symbol.trim()
      ? `Manual check for ${symbol.trim().toUpperCase()}`
      : "—";

  const signalModeReady = Boolean(initialSignalId.trim() && signalContext && !signalLoadError);
  const parsedQty = Number(quantity);
  const parsedStop = Number(stopLossPrice);
  const hasValidStopLoss = Number.isFinite(parsedStop) && parsedStop > 0;
  const riskPerShare =
    referencePrice !== null && hasValidStopLoss ? referencePrice - parsedStop : null;
  const totalRisk =
    riskPerShare !== null && Number.isFinite(parsedQty) && parsedQty > 0
      ? riskPerShare * parsedQty
      : null;
  const riskPercent =
    totalRisk !== null
      ? totalRisk / UI_ASSUMED_EQUITY
      : null;
  const isRiskInvalid =
    riskPerShare !== null &&
    totalRisk !== null &&
    (riskPerShare <= 0 || totalRisk <= 0 || (riskPercent !== null && riskPercent > 0.01));
  const stopRequiredBlocked =
    side === 'BUY' && (!hasValidStopLoss || !stopConfirmed || referencePrice === null);

  return (
    <div className="flex min-h-svh flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Paper trades: discretionary (manual) or from the scanner (signal). Chart and
          history update after each fill.
        </p>
      </div>

      <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
        <Button
          type="button"
          variant={tradeMode === "manual" ? "secondary" : "ghost"}
          size="sm"
          className={cn(tradeMode === "manual" && "shadow-sm")}
          onClick={() => setTradeMode("manual")}
        >
          Manual trade
        </Button>
        <Button
          type="button"
          variant={tradeMode === "signal" ? "secondary" : "ghost"}
          size="sm"
          className={cn(tradeMode === "signal" && "shadow-sm")}
          onClick={() => setTradeMode("signal")}
        >
          From signal
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tradeMode === "manual" ? "Place manual paper order" : "Place order from signal"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-7 md:items-end">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="order-symbol">
                  Symbol
                </label>
                {tradeMode === "manual" ? (
                  <select
                    id="order-symbol"
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value)}
                    className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm"
                    disabled={isLoadingSymbols || activeTrackedSymbols.length === 0}
                    required
                  >
                    <option value="">
                      {isLoadingSymbols
                        ? "Loading tracked symbols…"
                        : activeTrackedSymbols.length === 0
                          ? "No active tracked symbols available"
                          : "Select tracked symbol"}
                    </option>
                    {activeTrackedSymbols.map((row) => (
                      <option key={row.id} value={row.ticker}>
                        {row.ticker}
                        {row.name ? ` — ${row.name}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="order-symbol"
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value)}
                    placeholder="Symbol"
                    disabled={signalModeReady}
                    required
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="order-qty">
                  Quantity
                </label>
                <Input
                  id="order-qty"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  type="number"
                  min="1"
                  step="1"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="order-side">
                  Side
                </label>
                <select
                  id="order-side"
                  value={side}
                  onChange={(event) => setSide(event.target.value as OrderSide)}
                  className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm"
                >
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="order-stop">
                  Stop Loss
                </label>
                <Input
                  id="order-stop"
                  value={stopLossPrice}
                  onChange={(event) => {
                    setStopLossPrice(event.target.value);
                    setStopConfirmed(false);
                  }}
                  type="number"
                  min="0"
                  step="0.01"
                  required={side === "BUY"}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="order-tp">
                  Take Profit (optional)
                </label>
                <Input
                  id="order-tp"
                  value={takeProfitPrice}
                  onChange={(event) => setTakeProfitPrice(event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  (tradeMode === "signal" && !signalModeReady) ||
                  (tradeMode === "manual" && !isManualSymbolValid) ||
                  stopRequiredBlocked ||
                  isRiskInvalid
                }
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-7">
              <div className="md:col-start-5 md:col-span-1">
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {STOP_PRESET_PERCENTS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                      variant="ghost"
                      disabled={referencePrice === null}
                      onClick={() => {
                        if (referencePrice === null) return;
                        const nextStop = referencePrice * (1 - preset);
                        setStopLossPrice(nextStop.toFixed(2));
                        setStopConfirmed(false);
                      }}
                    >
                      -{Math.round(preset * 100)}%
                    </Button>
                  ))}
                </div>
              </div>
              <div className="md:col-start-6 md:col-span-1">
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {TAKE_PROFIT_PRESET_PERCENTS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                      variant="ghost"
                      disabled={referencePrice === null}
                      onClick={() => {
                        if (referencePrice === null) return;
                        const nextTarget = referencePrice * (1 + preset);
                        setTakeProfitPrice(nextTarget.toFixed(2));
                      }}
                    >
                      +{Math.round(preset * 100)}%
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={stopConfirmed}
                onChange={(event) => setStopConfirmed(event.target.checked)}
              />
              I confirm this stop loss before submitting.
            </label>
            {suggestionMessage ? (
              <p className="text-xs text-muted-foreground">{suggestionMessage}</p>
            ) : null}
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
              <p>Risk per share: {riskPerShare !== null ? fmtUsd(riskPerShare) : "—"}</p>
              <p>Total risk: {totalRisk !== null ? fmtUsd(totalRisk) : "—"}</p>
              <p>
                Risk %:{" "}
                {riskPercent !== null && Number.isFinite(riskPercent)
                  ? `${(riskPercent * 100).toFixed(2)}%`
                  : "—"}
              </p>
            </div>
            {isRiskInvalid ? (
              <p className="text-sm text-rose-600">
                Risk is too high or invalid. Adjust stop loss and quantity.
              </p>
            ) : null}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="order-note">
                Optional note (journal)
              </label>
              <textarea
                id="order-note"
                value={orderNote}
                onChange={(event) => setOrderNote(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Why you took this trade (optional, max 500 chars)"
                className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              />
            </div>
            {tradeMode === "signal" && !initialSignalId.trim() ? (
              <p className="text-sm text-muted-foreground">
                Use{" "}
                <Link href="/dashboard/signals" className="font-medium text-primary hover:underline">
                  Signals
                </Link>{" "}
                and choose <strong className="text-foreground">Go to paper trade</strong> to open
                this mode with a linked setup.
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {tradeMode === "signal" ? (
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Signal context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {isLoadingSignal ? (
                <p className="text-muted-foreground">Loading signal…</p>
              ) : null}
              {!isLoadingSignal && signalLoadError ? (
                <p className="text-rose-600 dark:text-rose-400">{signalLoadError}</p>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground">Setup</p>
                <p className="font-medium">{decisionTitle}</p>
              </div>
              {signalContext ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Confidence: {signalContext.confidence ?? "—"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Entry</p>
                      <p className="font-medium">{fmtUsd(signalContext.entryPrice)}</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Stop / Target</p>
                      <p className="font-medium">
                        {fmtUsd(signalContext.stopLoss)} / {fmtUsd(signalContext.targetPrice)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{signalContext.reason}</p>
                </>
              ) : !signalLoadError ? (
                <p className="text-muted-foreground">No signal loaded.</p>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Manual trade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Manual orders must use an active symbol already tracked in the database.
              </p>
            </CardContent>
          </Card>
        )}
        <div className={cn("lg:col-span-2", tradeMode === "manual" && "lg:col-span-2")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chart</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-4 pb-4">
                <TradingViewSymbolChart symbol={symbol} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {initialSignalId.trim() ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scanner-linked fills (this signal)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoadingLinked ? (
              <p className="text-muted-foreground">Loading linked orders…</p>
            ) : null}
            {!isLoadingLinked && linkedOrders.length === 0 ? (
              <p className="text-muted-foreground">
                No SIGNAL-tagged orders for this setup yet. Submit from &quot;From signal&quot; mode
                above.
              </p>
            ) : null}
            {!isLoadingLinked && linkedOrders.length > 0 ? (
              <ul className="space-y-1.5">
                {linkedOrders.map((o) => (
                  <li
                    key={o.orderId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      {formatDate(o.requestedAt)}
                    </span>
                    <span className="font-medium">
                      {o.side} {o.quantity} {o.symbol}
                    </span>
                    <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {editingOrderId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Edit stop / target — {editingSymbol}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Stop loss
              <Input
                type="number"
                min={0}
                step="0.01"
                value={editStop}
                onChange={(event) => setEditStop(event.target.value)}
                disabled={isSavingLevels}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Target (optional)
              <Input
                type="number"
                min={0}
                step="0.01"
                value={editTarget}
                onChange={(event) => setEditTarget(event.target.value)}
                disabled={isSavingLevels}
              />
            </label>
            <div className="flex gap-2">
              <Button
                onClick={() => void handleSaveLevels()}
                disabled={isSavingLevels}
              >
                {isSavingLevels ? "Saving..." : "Save levels"}
              </Button>
              <Button
                variant="outline"
                onClick={cancelEditingLevels}
                disabled={isSavingLevels}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open positions</CardTitle>
          {isUsMarketSessionOpen() ? (
            <p className="text-xs text-muted-foreground">
              Prices refresh every 60s during US market hours.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingPositions ? (
            <div className="p-4 text-sm text-muted-foreground">
              Loading positions...
            </div>
          ) : null}
          {!isLoadingPositions && sortedPositions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No open positions. Place a paper BUY to see live P&amp;L here.
            </div>
          ) : null}
          {!isLoadingPositions && sortedPositions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg cost</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Gain</TableHead>
                    <TableHead className="text-right">Unrealized</TableHead>
                    <TableHead className="text-right">Stop</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">To stop</TableHead>
                    <TableHead className="text-right">To target</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
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
                        {fmtUsd(position.averageCost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{fmtUsd(position.currentPrice)}</div>
                        {position.asOf ? (
                          <div className="text-xs text-muted-foreground">
                            {formatMarkAsOf(position.asOf)}
                            {position.priceSource ? ` · ${position.priceSource}` : ""}
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
                      <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
                        {fmtUsd(position.stopLossPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {fmtUsd(position.takeProfitPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(position.pctToStop)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(position.pctToTarget)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <PositionActionButtons
                          position={position}
                          busySymbol={closingSymbol}
                          onBusyChange={setClosingSymbol}
                          onActionStart={() => {
                            setError(null);
                            setMessage(null);
                          }}
                          onSuccess={setMessage}
                          onError={setError}
                          onRefresh={refreshTradingData}
                          onEdit={
                            position.linkedOrderId
                              ? () =>
                                  startEditingLevels({
                                    orderId: position.linkedOrderId as string,
                                    symbol: position.symbol,
                                    stop: position.stopLossPrice,
                                    target: position.takeProfitPrice,
                                  })
                              : undefined
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingOrders ? (
            <div className="p-4 text-sm text-muted-foreground">Loading orders...</div>
          ) : null}

          {!isLoadingOrders && sortedOrders.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No orders yet. Submit a paper order to begin testing.
            </div>
          ) : null}

          {!isLoadingOrders && sortedOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Time</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="min-w-[14rem]">Why</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Fill</TableHead>
                    <TableHead className="text-right">Stop</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOrders.map((order) => (
                    <TableRow key={order.orderId}>
                      <TableCell className="pl-4 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(order.requestedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={sourceBadgeClass(order.source)}>
                          {order.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {order.tradeRationale ? (
                          <div className="space-y-1">
                            {order.tradeRationale.strategyName ? (
                              <Badge variant="outline" className="text-xs">
                                {formatStrategyLabel(order.tradeRationale.strategyName)}
                              </Badge>
                            ) : null}
                            <p
                              className="text-xs text-muted-foreground line-clamp-2"
                              title={order.tradeRationale.reason}
                            >
                              {truncateText(order.tradeRationale.reason, 120)}
                            </p>
                            {order.tradeRationale.confidence != null ? (
                              <p className="text-[11px] text-muted-foreground">
                                Confidence {order.tradeRationale.confidence}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          {order.symbol}
                          <Badge
                            variant="outline"
                            className={universeBadgeClass(order.symbolUniverseType)}
                          >
                            {order.symbolUniverseType}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell>{order.side}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtUsd(order.fillPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
                        {fmtUsd(resolveOrderStop(order))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {fmtUsd(resolveOrderTarget(order))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {order.status === "NEW" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleCancel(order.orderId)}
                          >
                            Cancel
                          </Button>
                        ) : order.status === "FILLED" && order.side === "BUY" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              startEditingLevels({
                                orderId: order.orderId,
                                symbol: order.symbol,
                                stop: resolveOrderStop(order),
                                target: resolveOrderTarget(order),
                              })
                            }
                          >
                            Edit levels
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersSearchBridge(): React.JSX.Element {
  const searchParams = useSearchParams();
  const symbolRaw = searchParams.get("symbol")?.trim() ?? "";
  const signalIdRaw = searchParams.get("signalId")?.trim() ?? "";
  const remountKey = `${symbolRaw}|${signalIdRaw}`;

  return (
    <OrdersPageContent
      key={remountKey}
      initialSymbol={symbolRaw}
      initialSignalId={signalIdRaw}
    />
  );
}

export default function OrdersPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh flex-col gap-4 p-4 md:p-6">
          <p className="text-sm text-muted-foreground">Loading orders…</p>
        </div>
      }
    >
      <OrdersSearchBridge />
    </Suspense>
  );
}
