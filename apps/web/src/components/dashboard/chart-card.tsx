"use client";

import { useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { timeframes, type Timeframe } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export function ChartCard() {
  const [active, setActive] = useState<Timeframe>("1M");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">AAPL · Apple Inc.</CardTitle>
        <CardDescription>Intraday performance placeholder</CardDescription>
        <CardAction>
          <div
            role="tablist"
            aria-label="Chart timeframe"
            className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5"
          >
            {timeframes.map((tf) => (
              <Button
                key={tf}
                type="button"
                role="tab"
                aria-selected={active === tf}
                variant={active === tf ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setActive(tf)}
                className={cn(
                  "px-2",
                  active === tf ? "shadow-sm" : "text-muted-foreground",
                )}
              >
                {tf}
              </Button>
            ))}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div
          aria-label="Chart placeholder"
          className="relative flex h-[320px] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[32px_32px] opacity-40"
          />
          <div className="relative flex flex-col items-center gap-2 text-center">
            <LineChartIcon className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Chart placeholder · {active}</p>
            <p className="text-xs text-muted-foreground">
              Wire up real candles from <code>/market-data/candles</code>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
