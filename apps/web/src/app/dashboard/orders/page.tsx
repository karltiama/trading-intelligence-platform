"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  addTrackedSymbol,
  cancelOrder,
  getSignalById,
  listOrders,
  placeOrder,
  type OrderListItem,
  type OrderSide,
  type SignalItem,
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
import { TradingViewSymbolChart } from "@/components/dashboard/tradingview-symbol-chart";
import { cn } from "@/lib/utils";

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
  const [addTicker, setAddTicker] = useState("");
  const [addSymbolMessage, setAddSymbolMessage] = useState<string | null>(null);
  const [addSymbolError, setAddSymbolError] = useState<string | null>(null);
  const [isAddingSymbol, setIsAddingSymbol] = useState(false);

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
    } catch (err: unknown) {
      setOrders([]);
      setError(null);
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

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

  useEffect(() => {
    queueMicrotask(() => {
      void loadOrders();
    });
  }, [loadOrders]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLinkedOrders();
    });
  }, [loadLinkedOrders]);

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

      if (tradeMode === "signal") {
        await placeOrder({
          symbol: sym,
          side,
          quantity: parsedQty,
          source: "SIGNAL",
          signalId: initialSignalId.trim(),
          note: noteTrim,
        });
      } else {
        await placeOrder({
          symbol: sym,
          side,
          quantity: parsedQty,
          source: "MANUAL",
          note: noteTrim,
        });
      }
      setMessage("Order submitted successfully.");
      await loadOrders();
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
      await loadOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel order.");
    }
  }

  async function handleAddSymbol(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddSymbolMessage(null);
    setAddSymbolError(null);
    const t = addTicker.trim().toUpperCase();
    if (!t) return;
    setIsAddingSymbol(true);
    try {
      await addTrackedSymbol(t);
      setAddSymbolMessage(`${t} added to tracked symbols. Sync daily bars separately (e.g. POST /market-data/sync/:symbol with API key).`);
      setAddTicker("");
    } catch (err: unknown) {
      setAddSymbolError(err instanceof Error ? err.message : "Failed to add symbol.");
    } finally {
      setIsAddingSymbol(false);
    }
  }

  const decisionTitle = signalContext
    ? `${signalContext.strategyName} · ${signalContext.symbol}`
    : symbol.trim()
      ? `Manual check for ${symbol.trim().toUpperCase()}`
      : "—";

  const signalModeReady = Boolean(initialSignalId.trim() && signalContext && !signalLoadError);

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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="order-symbol">
                  Symbol
                </label>
                <Input
                  id="order-symbol"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                  placeholder="Symbol (e.g. AAPL)"
                  disabled={tradeMode === "signal" && signalModeReady}
                  required
                />
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
              <Button type="submit" disabled={isSubmitting || (tradeMode === "signal" && !signalModeReady)}>
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
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
                Unknown symbols are allowed for manual orders. The backend will create ON_DEMAND
                tracking and fetch minimal bars before execution.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Track a symbol</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={handleAddSymbol}>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="add-ticker">
                Ticker
              </label>
              <Input
                id="add-ticker"
                value={addTicker}
                onChange={(event) => setAddTicker(event.target.value)}
                placeholder="e.g. COST"
                className="max-w-xs"
              />
            </div>
            <Button type="submit" variant="outline" disabled={isAddingSymbol}>
              {isAddingSymbol ? "Adding…" : "Add to tracked"}
            </Button>
          </form>
          {addSymbolMessage ? (
            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{addSymbolMessage}</p>
          ) : null}
          {addSymbolError ? (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{addSymbolError}</p>
          ) : null}
        </CardContent>
      </Card>

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
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Fill</TableHead>
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
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
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
