import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function MorningRunbookCard() {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Paper session checklist</CardTitle>
        <CardDescription>
          Daily sync powers scanners and regime (~200 daily bars per CORE symbol). Hourly data
          powers short chart ranges only — CORE refreshes on a weekday cron; ON_DEMAND fills when
          you open 7D/30D on the chart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
          <li>
            Ensure daily bars are current (weekday cron or{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              npm run verify:daily-readiness
            </code>{" "}
            in <code className="font-mono text-xs">apps/api</code>).
          </li>
          <li>
            Open{" "}
            <Link href="/dashboard/signals" className="font-medium text-foreground hover:underline">
              Signals
            </Link>{" "}
            and run <strong className="text-foreground">Run Scan</strong>.
          </li>
          <li>
            Review setups, then use{" "}
            <strong className="text-foreground">Go to paper trade</strong>.
          </li>
          <li>
            On{" "}
            <Link href="/dashboard/orders" className="font-medium text-foreground hover:underline">
              Orders
            </Link>
            , use <strong className="text-foreground">From signal</strong> for scanner setups or{" "}
            <strong className="text-foreground">Manual trade</strong> for discretion — then submit.
          </li>
          <li>Return here to watch cash, equity, and open positions update.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
