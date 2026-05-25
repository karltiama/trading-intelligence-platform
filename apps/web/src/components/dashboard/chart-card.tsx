"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SymbolPriceChart } from "@/components/dashboard/symbol-price-chart";

type ChartCardProps = {
  symbol: string;
};

export function ChartCard({ symbol }: ChartCardProps): React.JSX.Element {
  const normalized = symbol.trim().toUpperCase();

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">
          {normalized ? `${normalized} · daily closes` : "Price chart"}
        </CardTitle>
        <CardDescription>
          End-of-day bars from{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            GET /market-data/:symbol/bars
          </code>
          . Click a watchlist row to change symbol.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <SymbolPriceChart symbol={symbol} variant="plain" />
      </CardContent>
    </Card>
  );
}
