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
          Sync data first so scans and fills work (symbols need ~200 daily bars; orders need a
          tracked symbol with a quote).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
          <li>
            Open{" "}
            <Link href="/dashboard/signals" className="font-medium text-foreground hover:underline">
              Signals
            </Link>{" "}
            and run <strong className="text-foreground">Run Scan</strong>.
          </li>
          <li>Review setups, then use <strong className="text-foreground">Go to paper trade</strong>.</li>
          <li>
            On{" "}
            <Link href="/dashboard/orders" className="font-medium text-foreground hover:underline">
              Orders
            </Link>
            , confirm chart + levels, size, and submit.
          </li>
          <li>Return here to watch cash, equity, and open positions update.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
