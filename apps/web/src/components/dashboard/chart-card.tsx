"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TradingViewSymbolChart } from "@/components/dashboard/tradingview-symbol-chart";

type ChartCardProps = {
  symbol: string;
};

export function ChartCard({ symbol }: ChartCardProps): React.JSX.Element {
  const normalized = symbol.trim().toUpperCase();

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">
          {normalized ? `${normalized} · chart` : "Chart"}
        </CardTitle>
        <CardDescription>
          TradingView embedded chart. Click a watchlist row to change symbol.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <TradingViewSymbolChart symbol={symbol} variant="plain" height={400} />
      </CardContent>
    </Card>
  );
}
