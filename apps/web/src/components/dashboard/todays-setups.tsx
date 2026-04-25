import { Target } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { todaysSetups } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const confidenceTone = (pct: number) => {
  if (pct >= 75) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (pct >= 60) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
};

export function TodaysSetups() {
  return (
    <section aria-labelledby="todays-setups-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2
          id="todays-setups-heading"
          className="text-base font-semibold tracking-tight"
        >
          Today&apos;s Setups
        </h2>
        <span className="text-xs text-muted-foreground">
          {todaysSetups.length} opportunities
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {todaysSetups.map((setup) => (
          <Card key={setup.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Target className="size-4" />
                  </span>
                  <CardTitle>{setup.symbol}</CardTitle>
                </div>
                <Badge className={cn("text-xs", confidenceTone(setup.confidencePct))}>
                  {setup.confidencePct}% confidence
                </Badge>
              </div>
              <CardDescription>Swing setup · paper trade</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Entry</span>
                  <span className="font-medium tabular-nums">{setup.entry}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Stop</span>
                  <span className="font-medium tabular-nums">{setup.stop}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">R:R</span>
                  <span className="font-medium tabular-nums">
                    {setup.riskReward}
                  </span>
                </div>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Dummy setup — wire to real signals once the backend exposes them.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
