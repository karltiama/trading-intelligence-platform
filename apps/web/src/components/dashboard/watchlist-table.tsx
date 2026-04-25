 "use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Direction } from "@/lib/dashboard-data";
import { getMarketSummary, type MarketSummaryItem } from "@/lib/api";
import { cn } from "@/lib/utils";

type WatchlistUiRow = {
  symbol: string;
  price: string;
  changePct: number;
  volume: string;
  trend: Direction;
  signal: "Buy" | "Hold" | "Sell" | "Watch";
};

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const formatVolume = (value: number) => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return `${value}`;
};

const toUiTrend = (trend: MarketSummaryItem["trend"]): Direction => {
  if (trend === "Bullish") return "up";
  if (trend === "Bearish") return "down";
  return "flat";
};

const toSignal = (
  trend: MarketSummaryItem["trend"],
): WatchlistUiRow["signal"] => {
  if (trend === "Bullish") return "Buy";
  if (trend === "Bearish") return "Watch";
  return "Hold";
};

const toUiRow = (item: MarketSummaryItem): WatchlistUiRow => ({
  symbol: item.symbol,
  price: formatPrice(item.close),
  changePct: item.changePercent,
  volume: formatVolume(item.volume),
  trend: toUiTrend(item.trend),
  signal: toSignal(item.trend),
});

const formatChange = (pct: number) => {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
};

const changeClass = (pct: number) =>
  pct > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : pct < 0
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

const TrendIcon = ({ trend }: { trend: WatchlistUiRow["trend"] }) => {
  if (trend === "up") {
    return (
      <TrendingUp
        className="size-4 text-emerald-600 dark:text-emerald-400"
        aria-label="uptrend"
      />
    );
  }
  if (trend === "down") {
    return (
      <TrendingDown
        className="size-4 text-rose-600 dark:text-rose-400"
        aria-label="downtrend"
      />
    );
  }
  return (
    <Minus className="size-4 text-muted-foreground" aria-label="flat trend" />
  );
};

const signalVariant = (
  signal: WatchlistUiRow["signal"],
): "default" | "secondary" | "destructive" | "outline" => {
  if (signal === "Buy") return "default";
  if (signal === "Sell") return "destructive";
  if (signal === "Watch") return "outline";
  return "secondary";
};

export function WatchlistTable() {
  const [rows, setRows] = useState<WatchlistUiRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadMarketSummary() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getMarketSummary();
        if (!isMounted) return;
        setRows(response.map(toUiRow));
      } catch (err: unknown) {
        if (!isMounted) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load market summary from backend.";
        setError(message);
        setRows([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadMarketSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Watchlist</CardTitle>
        <CardDescription>Tracked symbols with live signals</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">
            Loading market data...
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="p-4 text-sm text-rose-600 dark:text-rose-400">
            Could not load market data from the backend. {error}
          </div>
        ) : null}

        {!isLoading && !error && rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No market data found. Run the market data sync first.
          </div>
        ) : null}

        {!isLoading && !error && rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Symbol</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Change %</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-center">Trend</TableHead>
              <TableHead className="pr-4 text-right">Signal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.symbol}>
                <TableCell className="pl-4 font-medium">{row.symbol}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.price}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    changeClass(row.changePct),
                  )}
                >
                  {formatChange(row.changePct)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.volume}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <TrendIcon trend={row.trend} />
                  </div>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Badge variant={signalVariant(row.signal)}>{row.signal}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
