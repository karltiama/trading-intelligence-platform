import type { OrderListItem } from "@/lib/api";

export function fmtUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function resolveOrderStop(order: OrderListItem): number | null {
  return order.stopLossPrice ?? order.tradeRationale?.stopLoss ?? null;
}

export function resolveOrderTarget(order: OrderListItem): number | null {
  return order.takeProfitPrice ?? order.tradeRationale?.targetPrice ?? null;
}

export function fmtPct(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function pctGainClass(value: number | null): string {
  if (value == null) return "text-muted-foreground";
  if (value > 0) return "text-emerald-700 dark:text-emerald-400";
  if (value < 0) return "text-rose-700 dark:text-rose-400";
  return "text-muted-foreground";
}
