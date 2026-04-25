import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { insights, type Insight } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const toneFor = (
  tone: Insight["tone"],
): { icon: LucideIcon; className: string } => {
  if (tone === "positive") {
    return {
      icon: TrendingUp,
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (tone === "negative") {
    return {
      icon: TrendingDown,
      className: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
  }
  return { icon: Lightbulb, className: "bg-muted text-muted-foreground" };
};

export function InsightsPanel() {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Insights</CardTitle>
        <CardDescription>Automated market observations</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {insights.map((insight) => {
          const tone = toneFor(insight.tone);
          const Icon = tone.icon;
          return (
            <div
              key={insight.id}
              className="flex gap-3 rounded-lg border bg-card p-3"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  tone.className,
                )}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{insight.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {insight.symbol}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {insight.body}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
