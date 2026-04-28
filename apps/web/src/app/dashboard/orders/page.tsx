"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  cancelOrder,
  getSignalById,
  listOrders,
  placeOrder,
  type OrderListItem,
  type OrderSide,
  type SignalItem,
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

type OrdersPageContentProps = {
  initialSymbol: string;
  initialSignalId: string;
};

function OrdersPageContent({
  initialSymbol,
  initialSignalId,
}: OrdersPageContentProps): React.JSX.Element {
  const [symbol, setSymbol] = useState(() => initialSymbol.trim().toUpperCase());
  const [quantity, setQuantity] = useState("1");
  const [side, setSide] = useState<OrderSide>("BUY");
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
    setError(null);
    try {
      const rows = await listOrders();
      setOrders(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load orders.");
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
      setLinkedOrders(rows);
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
    try {
      const parsedQty = Number(quantity);
      await placeOrder({
        symbol: symbol.trim().toUpperCase(),
        side,
        quantity: parsedQty,
        ...(initialSignalId.trim()
          ? { signalId: initialSignalId.trim() }
          : {}),
      });
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

  const decisionTitle = signalContext
    ? `${signalContext.strategyName} · ${signalContext.symbol}`
    : symbol.trim()
      ? `Manual check for ${symbol.trim().toUpperCase()}`
      : "—";

  return (
    <div className="flex min-h-svh flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Place paper trades and manage open orders.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Place Order</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-3 md:grid-cols-5" onSubmit={handleSubmit}>
            <Input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="Symbol (e.g. AAPL)"
              className="md:col-span-2"
              required
            />
            <Input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              min="1"
              step="1"
              placeholder="Quantity"
              required
            />
            <select
              value={side}
              onChange={(event) => setSide(event.target.value as OrderSide)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Decision Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isLoadingSignal ? (
              <p className="text-muted-foreground">Loading signal…</p>
            ) : null}
            {!isLoadingSignal && signalLoadError ? (
              <p className="text-rose-600 dark:text-rose-400">{signalLoadError}</p>
            ) : null}
            <div>
              <p className="text-xs text-muted-foreground">Setup / Signal</p>
              <p className="font-medium">{decisionTitle}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reason</p>
              <p className="text-muted-foreground">
                {signalContext?.reason ??
                  "Confirm recent close behavior before placing a paper order."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Risk Status</p>
                <p className="font-medium">
                  {signalContext ? "From scanner" : "Pending checks"}
                </p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Side</p>
                <p className="font-medium">{side}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Entry</p>
                <p className="font-medium">
                  {signalContext ? fmtUsd(signalContext.entryPrice) : "Market (manual)"}
                </p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Stop / Target</p>
                <p className="font-medium">
                  {signalContext
                    ? `${fmtUsd(signalContext.stopLoss)} / ${fmtUsd(signalContext.targetPrice)}`
                    : "Not set"}
                </p>
              </div>
            </div>
            {signalContext?.riskReward != null ? (
              <p className="text-xs text-muted-foreground">
                R:R {signalContext.riskReward.toFixed(2)} · Horizon{" "}
                {signalContext.timeHorizon ?? "—"}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chart Context</CardTitle>
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
            <CardTitle className="text-base">Paper trades linked to this signal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoadingLinked ? (
              <p className="text-muted-foreground">Loading linked orders…</p>
            ) : null}
            {!isLoadingLinked && linkedOrders.length === 0 ? (
              <p className="text-muted-foreground">
                No orders recorded for this signal yet. Submitting an order from this page
                stores the link automatically.
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
          <CardTitle className="text-base">Open / History</CardTitle>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Time</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOrders.map((order) => (
                  <TableRow key={order.orderId}>
                    <TableCell className="pl-4 text-xs text-muted-foreground">
                      {formatDate(order.requestedAt)}
                    </TableCell>
                    <TableCell className="font-medium">{order.symbol}</TableCell>
                    <TableCell>{order.side}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.quantity}
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
