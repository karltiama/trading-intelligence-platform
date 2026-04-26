"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cancelOrder,
  listOrders,
  placeOrder,
  type OrderListItem,
  type OrderSide,
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function statusVariant(
  status: OrderListItem["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "FILLED") return "default";
  if (status === "CANCELED") return "secondary";
  return "outline";
}

export default function OrdersPage(): React.JSX.Element {
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

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
      });
      setMessage("Order submitted successfully.");
      setSymbol("");
      await loadOrders();
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

      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

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
