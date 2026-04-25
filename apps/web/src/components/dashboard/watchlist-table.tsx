import { Minus, TrendingDown, TrendingUp } from "lucide-react";

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
import { watchlistRows, type WatchlistRow } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

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

const TrendIcon = ({ trend }: { trend: WatchlistRow["trend"] }) => {
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
  signal: WatchlistRow["signal"],
): "default" | "secondary" | "destructive" | "outline" => {
  if (signal === "Buy") return "default";
  if (signal === "Sell") return "destructive";
  if (signal === "Watch") return "outline";
  return "secondary";
};

export function WatchlistTable() {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Watchlist</CardTitle>
        <CardDescription>Tracked symbols with live signals</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
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
            {watchlistRows.map((row) => (
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
      </CardContent>
    </Card>
  );
}
