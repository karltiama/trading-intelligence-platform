"use client";

import type { BrokerSnapshot } from "@/lib/api";
import { fmtPct, fmtUsd, pctGainClass } from "@/lib/order-levels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type BrokerBalancePanelProps = {
  snapshot: BrokerSnapshot | null;
  isLoading: boolean;
  error: string | null;
  disabled: boolean;
};

export const BROKER_EXECUTION_NOTICE =
  "Orders placed in this app currently update the internal simulator only. Alpaca Paper is displayed as a read-only broker balance until broker routing is enabled.";

function brokerUnrealizedPnl(snapshot: BrokerSnapshot): number {
  return snapshot.positions.reduce(
    (total, position) => total + position.unrealizedPnl,
    0,
  );
}

export function BrokerBalancePanel({
  snapshot,
  isLoading,
  error,
  disabled,
}: BrokerBalancePanelProps): React.JSX.Element {
  const unrealizedPnl =
    snapshot && snapshot.status === "ok" ? brokerUnrealizedPnl(snapshot) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">
          Broker account: Alpaca Paper
        </h2>
        <p className="text-sm text-muted-foreground">
          App execution mode: Internal simulator
        </p>
      </div>

      <Card className="border-amber-200/60 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
          {BROKER_EXECUTION_NOTICE}
        </CardContent>
      </Card>

      {disabled ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Broker read sync is disabled. Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              BROKER_READ_PROVIDER=alpaca
            </code>{" "}
            on the API to show Alpaca paper balances.
          </CardContent>
        </Card>
      ) : null}

      {!disabled && error ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">
            Could not load Alpaca broker snapshot. {error}
          </CardContent>
        </Card>
      ) : null}

      {!disabled && snapshot?.status === "error" ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">
            Alpaca broker snapshot is unavailable.
            {snapshot.message ? ` ${snapshot.message}` : ""}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Loading Alpaca broker snapshot...
          </CardContent>
        </Card>
      ) : null}

      {!disabled && !isLoading && snapshot?.status === "ok" ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Equity
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {fmtUsd(snapshot.account.equity)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cash
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {fmtUsd(snapshot.account.cash)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Buying power
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tracking-tight">
                {fmtUsd(snapshot.account.buyingPower)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Unrealized P&amp;L
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  pctGainClass(unrealizedPnl),
                )}
              >
                {fmtUsd(unrealizedPnl)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Day change
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  pctGainClass(snapshot.account.dayChange),
                )}
              >
                {fmtUsd(snapshot.account.dayChange)}
                <span className="ml-2 text-base font-medium">
                  {fmtPct(snapshot.account.dayChangePercent * 100)}
                </span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alpaca open positions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {snapshot.positions.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No open positions at Alpaca.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Symbol</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Avg cost</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Market value</TableHead>
                        <TableHead className="pr-4 text-right">
                          Unrealized
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.positions.map((position) => (
                        <TableRow key={position.symbol}>
                          <TableCell className="pl-4 font-medium">
                            {position.symbol}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {position.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtUsd(position.averageCost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtUsd(position.currentPrice)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtUsd(position.marketValue)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "pr-4 text-right tabular-nums",
                              pctGainClass(position.unrealizedPnl),
                            )}
                          >
                            {fmtUsd(position.unrealizedPnl)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
