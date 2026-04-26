"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listAutomationRuns,
  listAutomationRunSignals,
  triggerAutomationRun,
  type AutomationRunListItem,
  type AutomationRunSignal,
  type OrderSide,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function runStatusVariant(
  status: AutomationRunListItem["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "SUCCESS") return "default";
  if (status === "FAILED") return "destructive";
  if (status === "RUNNING") return "outline";
  return "secondary";
}

function signalStatusVariant(
  status: AutomationRunSignal["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PLACED") return "default";
  if (status === "REJECTED_RISK" || status === "FAILED") return "destructive";
  if (status === "SKIPPED_DUPLICATE") return "secondary";
  return "outline";
}

export default function AutomationPage(): React.JSX.Element {
  const [strategy, setStrategy] = useState("manual-ui-test");
  const [symbolId, setSymbolId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<OrderSide>("BUY");
  const [quantity, setQuantity] = useState("1");

  const [runs, setRuns] = useState<AutomationRunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [signals, setSignals] = useState<AutomationRunSignal[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLoadingSignals, setIsLoadingSignals] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedRuns = useMemo(
    () =>
      [...runs].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    [runs],
  );

  const loadRuns = useCallback(async () => {
    setIsLoadingRuns(true);
    setError(null);
    try {
      const response = await listAutomationRuns();
      setRuns(response);
      if (!selectedRunId && response.length > 0) {
        setSelectedRunId(response[0].runId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load runs.");
    } finally {
      setIsLoadingRuns(false);
    }
  }, [selectedRunId]);

  const loadSignals = useCallback(async (runId: string) => {
    setIsLoadingSignals(true);
    setError(null);
    try {
      const response = await listAutomationRunSignals(runId);
      setSignals(response);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load signals.");
      setSignals([]);
    } finally {
      setIsLoadingSignals(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setSignals([]);
      return;
    }
    void loadSignals(selectedRunId);
  }, [selectedRunId, loadSignals]);

  async function handleRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await triggerAutomationRun({
        strategy: strategy.trim(),
        signals: [
          {
            symbolId: symbolId.trim(),
            symbol: symbol.trim().toUpperCase(),
            side,
            signalAt: new Date().toISOString(),
            quantity: Number(quantity),
          },
        ],
      });
      setMessage("Automation run triggered.");
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to trigger run.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Automation</h1>
        <p className="text-sm text-muted-foreground">
          Trigger runs and inspect resulting signal actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Automation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRun} className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Input
              value={strategy}
              onChange={(event) => setStrategy(event.target.value)}
              placeholder="Strategy"
              required
            />
            <Input
              value={symbolId}
              onChange={(event) => setSymbolId(event.target.value)}
              placeholder="Symbol ID"
              required
            />
            <Input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="Symbol"
              required
            />
            <select
              value={side}
              onChange={(event) => setSide(event.target.value as OrderSide)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
            <Input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              min="1"
              step="1"
              required
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Running..." : "Run"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingRuns ? (
              <div className="p-4 text-sm text-muted-foreground">Loading runs...</div>
            ) : null}

            {!isLoadingRuns && sortedRuns.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No runs yet. Trigger a run to begin testing.
              </div>
            ) : null}

            {!isLoadingRuns && sortedRuns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Started</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRuns.map((run) => (
                    <TableRow key={run.runId}>
                      <TableCell className="pl-4 text-xs text-muted-foreground">
                        {formatDate(run.startedAt)}
                      </TableCell>
                      <TableCell className="font-medium">{run.strategy}</TableCell>
                      <TableCell>
                        <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          size="sm"
                          variant={selectedRunId === run.runId ? "default" : "outline"}
                          onClick={() => setSelectedRunId(run.runId)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selected Run Signals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedRunId ? (
              <div className="p-4 text-sm text-muted-foreground">
                Select a run to inspect signals.
              </div>
            ) : null}

            {selectedRunId && isLoadingSignals ? (
              <div className="p-4 text-sm text-muted-foreground">Loading signals...</div>
            ) : null}

            {selectedRunId && !isLoadingSignals && signals.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No signals recorded for this run.
              </div>
            ) : null}

            {selectedRunId && !isLoadingSignals && signals.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signals.map((signal) => (
                    <TableRow key={signal.executionId}>
                      <TableCell className="pl-4 font-medium">{signal.symbol}</TableCell>
                      <TableCell>{signal.side}</TableCell>
                      <TableCell>
                        <Badge variant={signalStatusVariant(signal.status)}>
                          {signal.status === "REJECTED_RISK"
                            ? "REJECTED (RISK)"
                            : signal.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-sm text-muted-foreground">
                        {signal.reason ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
