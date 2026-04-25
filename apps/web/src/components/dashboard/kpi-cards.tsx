import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { kpiCards, type Direction } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const toneFor = (direction: Direction) => {
  if (direction === "up") {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      Icon: ArrowUpRight,
    };
  }
  if (direction === "down") {
    return {
      text: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
      Icon: ArrowDownRight,
    };
  }
  return {
    text: "text-muted-foreground",
    bg: "bg-muted text-muted-foreground",
    Icon: ArrowRight,
  };
};

export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpiCards.map((kpi) => {
        const tone = toneFor(kpi.direction);
        return (
          <Card key={kpi.id}>
            <CardHeader>
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {kpi.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="secondary" className={cn("gap-0.5", tone.bg)}>
                  <tone.Icon className="size-3" />
                  {kpi.delta}
                </Badge>
                {kpi.hint ? (
                  <span className="text-muted-foreground">{kpi.hint}</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
