"use client";

import { useState } from "react";

import { getAutomationGuardrail } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function GuardrailsPage(): React.JSX.Element {
  const [strategy, setStrategy] = useState("manual-ui-test");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardrail, setGuardrail] = useState<{
    strategy: string;
    enabled: boolean;
    cooldownSeconds: number;
    lastTriggeredAt: string | null;
    updatedAt: string;
  } | null>(null);

  async function loadGuardrail() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAutomationGuardrail(strategy.trim());
      setGuardrail(response);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Guardrail endpoint unavailable for this strategy.",
      );
      setGuardrail(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Guardrails</h1>
        <p className="text-sm text-muted-foreground">
          Lightweight automation guardrail visibility for manual testing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Load Strategy Guardrail</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Input
            value={strategy}
            onChange={(event) => setStrategy(event.target.value)}
            placeholder="Strategy name"
          />
          <Button onClick={() => void loadGuardrail()} disabled={isLoading}>
            {isLoading ? "Loading..." : "Load"}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {guardrail ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{guardrail.strategy}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Enabled</p>
              <div className="mt-1">
                <Badge variant={guardrail.enabled ? "default" : "secondary"}>
                  {guardrail.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Cooldown Seconds</p>
              <p className="mt-1 text-lg font-semibold">
                {guardrail.cooldownSeconds}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Last Triggered</p>
              <p className="mt-1 text-sm">{formatDate(guardrail.lastTriggeredAt)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Updated At</p>
              <p className="mt-1 text-sm">{formatDate(guardrail.updatedAt)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Events</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Recent audit event listing is not exposed by a dedicated backend endpoint yet
          in this sprint, so this page focuses on guardrail visibility.
        </CardContent>
      </Card>
    </div>
  );
}
