"use client";

import type { MarketStateResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MarketStateCardProps = {
  marketState: MarketStateResponse | null;
  title?: string;
};

function guidanceBadgeClass(value: "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE"): string {
  if (value === "FAVORABLE") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (value === "UNFAVORABLE") {
    return "border-rose-300 bg-rose-50 text-rose-900";
  }
  return "border-slate-300 bg-slate-100 text-slate-900";
}

export function MarketStateCard({
  marketState,
  title = "Market State",
}: MarketStateCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!marketState ? (
          <p className="text-muted-foreground">
            Market state is currently unavailable.
          </p>
        ) : (
          <>
            <div>
              <p className="text-base font-semibold">{marketState.label}</p>
              <p className="text-muted-foreground">{marketState.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Volatility: {marketState.volatilityRegime}</Badge>
              <Badge variant="outline">Breadth: {marketState.breadthState}</Badge>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {marketState.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Strategy Guidance
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span>Trend Pullback:</span>
                <Badge
                  variant="outline"
                  className={guidanceBadgeClass(marketState.strategyGuidance.trendPullback)}
                >
                  {marketState.strategyGuidance.trendPullback}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Relative Strength Breakout:</span>
                <Badge
                  variant="outline"
                  className={guidanceBadgeClass(
                    marketState.strategyGuidance.relativeStrengthBreakout,
                  )}
                >
                  {marketState.strategyGuidance.relativeStrengthBreakout}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Oversold Bounce:</span>
                <Badge
                  variant="outline"
                  className={guidanceBadgeClass(marketState.strategyGuidance.oversoldBounce)}
                >
                  {marketState.strategyGuidance.oversoldBounce}
                </Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
