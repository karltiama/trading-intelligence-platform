"use client";

import { useEffect, useMemo, useState } from "react";

import { getSymbolDailyBars, type DailyBar } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ChartRange = "30D" | "90D" | "1Y";

const RANGE_LIMITS: Record<ChartRange, number> = {
  "30D": 30,
  "90D": 90,
  "1Y": 365,
};

type SymbolPriceChartProps = {
  symbol: string;
  /** `card` = full Card wrapper (default). `plain` = chart body only for embedding in a parent Card. */
  variant?: "card" | "plain";
};

type ChartPoint = {
  x: number;
  y: number;
  close: number;
  timestamp: string;
};

function toChartPoints(bars: DailyBar[]): ChartPoint[] {
  if (bars.length === 0) return [];
  const sorted = [...bars].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const closes = sorted.map((bar) => bar.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = Math.max(max - min, 1e-6);

  return sorted.map((bar, index) => {
    const x = (index / Math.max(sorted.length - 1, 1)) * 100;
    const y = 100 - ((bar.close - min) / range) * 100;
    return { x, y, close: bar.close, timestamp: bar.timestamp };
  });
}

function toPath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
    )
    .join(" ");
}

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

function RangeToolbar(props: {
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  disabled: boolean;
}): React.JSX.Element {
  const { range, onRangeChange, disabled } = props;
  return (
    <div className="flex items-center justify-end gap-1">
      {(["30D", "90D", "1Y"] as const).map((option) => (
        <Button
          key={option}
          size="sm"
          variant={range === option ? "default" : "outline"}
          onClick={() => onRangeChange(option)}
          disabled={disabled}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}

export function SymbolPriceChart({
  symbol,
  variant = "card",
}: SymbolPriceChartProps): React.JSX.Element {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const [range, setRange] = useState<ChartRange>("30D");
  const [bars, setBars] = useState<DailyBar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBars() {
      if (!normalizedSymbol) {
        setBars([]);
        setError(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const response = await getSymbolDailyBars(
          normalizedSymbol,
          RANGE_LIMITS[range],
        );
        if (!isMounted) return;
        setBars(response);
      } catch (err: unknown) {
        if (!isMounted) return;
        setBars([]);
        setError(err instanceof Error ? err.message : "Failed to load chart data.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBars();
    return () => {
      isMounted = false;
    };
  }, [normalizedSymbol, range]);

  const points = useMemo(() => toChartPoints(bars), [bars]);
  const pathData = useMemo(() => toPath(points), [points]);
  const latestClose = points.length > 0 ? points[points.length - 1].close : null;

  const body = (
    <div className="space-y-3">
      {!normalizedSymbol ? (
        <p className="text-sm text-muted-foreground">
          Select a watchlist symbol or sync market data to load daily bars.
        </p>
      ) : null}

      {variant === "plain" ? (
        <RangeToolbar
          range={range}
          onRangeChange={setRange}
          disabled={!normalizedSymbol}
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {!isLoading && !error && normalizedSymbol && points.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bar data found for this symbol/range.
        </p>
      ) : null}

      {!isLoading && !error && points.length > 0 ? (
        <div className="space-y-2">
          <div className="h-40 w-full rounded-md border p-2">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-full w-full"
              aria-label={`${normalizedSymbol} close price line chart`}
            >
              <path
                d={pathData}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-primary"
              />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground">
            Latest close: {latestClose === null ? "-" : usd(latestClose)}
          </p>
        </div>
      ) : null}
    </div>
  );

  if (variant === "plain") {
    return body;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Price Context {normalizedSymbol ? `(${normalizedSymbol})` : ""}
        </CardTitle>
        <RangeToolbar
          range={range}
          onRangeChange={setRange}
          disabled={!normalizedSymbol}
        />
      </CardHeader>
      <CardContent className="space-y-3">{body}</CardContent>
    </Card>
  );
}
