"use client";

import { useEffect, useRef, useState } from "react";

import { getTradingViewChartSymbol } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TradingViewSymbolChartProps = {
  symbol: string;
  height?: number;
  /** `card` = full Card wrapper (default). `plain` = chart body only for embedding in a parent Card. */
  variant?: "card" | "plain";
};

export function TradingViewSymbolChart({
  symbol,
  height = 320,
  variant = "card",
}: TradingViewSymbolChartProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedSymbol = symbol.trim().toUpperCase();
  const [tradingViewSymbol, setTradingViewSymbol] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    if (!normalizedSymbol) {
      setTradingViewSymbol("");
      setResolveError(null);
      return;
    }

    let cancelled = false;
    setIsResolving(true);
    setResolveError(null);

    void getTradingViewChartSymbol(normalizedSymbol)
      .then((result) => {
        if (!cancelled) {
          setTradingViewSymbol(result.tradingViewSymbol);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTradingViewSymbol("");
          setResolveError(
            error instanceof Error
              ? error.message
              : "Could not resolve chart exchange for this symbol.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolving(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedSymbol]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !tradingViewSymbol) {
      return;
    }

    container.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol: tradingViewSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_top_toolbar: true,
      hide_legend: false,
      save_image: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      studies: [],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [tradingViewSymbol]);

  const body = (
    <>
      {!normalizedSymbol ? (
        <p className="text-sm text-muted-foreground">
          Select a watchlist symbol to load the embedded chart.
        </p>
      ) : isResolving ? (
        <p className="text-sm text-muted-foreground">Resolving chart symbol...</p>
      ) : resolveError ? (
        <p className="text-sm text-destructive">{resolveError}</p>
      ) : (
        <div
          className="rounded-md border"
          style={{ height }}
          aria-label={`${normalizedSymbol} embedded TradingView chart`}
        >
          <div ref={containerRef} className="h-full w-full" />
        </div>
      )}
      {variant === "plain" && tradingViewSymbol ? (
        <p className="mt-2 text-xs text-muted-foreground">{tradingViewSymbol}</p>
      ) : null}
    </>
  );

  if (variant === "plain") {
    return body;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Embedded Chart {normalizedSymbol ? `(${normalizedSymbol})` : ""}
        </CardTitle>
        {tradingViewSymbol ? (
          <p className="text-xs text-muted-foreground">{tradingViewSymbol}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {body}
      </CardContent>
    </Card>
  );
}
