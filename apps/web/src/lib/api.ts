const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_DEV_USER_EMAIL = "demo@local.dev";

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly payload?: unknown;

  constructor(params: {
    status: number;
    statusText: string;
    message: string;
    payload?: unknown;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.statusText = params.statusText;
    this.payload = params.payload;
  }
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

function getDevUserEmail(): string {
  return process.env.NEXT_PUBLIC_DEV_USER_EMAIL ?? DEFAULT_DEV_USER_EMAIL;
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-user-email": getDevUserEmail(),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : undefined;

  if (!response.ok) {
    const message =
      (typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string" &&
        payload.message) ||
      `${response.status} ${response.statusText}`;
    throw new ApiError({
      status: response.status,
      statusText: response.statusText,
      message: `API request failed for ${path}: ${message}`,
      payload,
    });
  }

  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
): Promise<TResponse> {
  return request<TResponse>(path, { method: "POST", body });
}

export type MarketSummaryItem = {
  symbol: string;
  close: number;
  changePercent: number;
  volume: number;
  trend: "Bullish" | "Bearish" | "Neutral";
  lastDate?: string;
};

export type DailyBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PortfolioSummary = {
  userEmail: string;
  currency: string;
  cashBalance: number;
  positionsValue: number;
  totalEquity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  asOf: string | null;
};

export type PortfolioPosition = {
  userEmail: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
  asOf: string | null;
};

export type OrderSide = "BUY" | "SELL";
export type OrderStatus = "NEW" | "FILLED" | "CANCELED";
export type TradeSource = "SIGNAL" | "MANUAL" | "AUTOMATION";
export type UniverseType = "CORE" | "ON_DEMAND";

export type OrderListItem = {
  userEmail: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  type: "MARKET";
  status: OrderStatus;
  quantity: number;
  requestedAt: string;
  filledAt: string | null;
  canceledAt: string | null;
  signalId: string | null;
  source: TradeSource;
  note: string | null;
  fillPrice: number | null;
  symbolUniverseType: UniverseType;
};

export type PlaceOrderBody = {
  symbol: string;
  side: OrderSide;
  quantity: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  source?: TradeSource;
  signalId?: string;
  note?: string;
};

export type PlaceOrderResponse = {
  userEmail: string;
  orderId: string;
  status: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  fillPrice: number;
  fillNotional: number;
  cashBalance: number;
  signalId: string | null;
  source: TradeSource;
  note: string | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  riskPerShare: number | null;
  totalRisk: number | null;
  riskPercent: number | null;
  riskRewardRatio: number | null;
};

export type StopLossSuggestion = {
  symbol: string;
  lookback: number;
  swingLow: number;
  suggestedStopLoss: number;
  referencePrice: number;
};

export type CancelOrderResponse = {
  userEmail: string;
  orderId: string;
  status: "CANCELED";
};

export type AutomationRunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
export type AutomationSignalStatus =
  | "PENDING"
  | "PLACED"
  | "SKIPPED_DUPLICATE"
  | "REJECTED_RISK"
  | "FAILED";

export type AutomationRunListItem = {
  userEmail: string;
  runId: string;
  strategy: string;
  status: AutomationRunStatus;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
};

export type AutomationRunSignal = {
  executionId: string;
  signalKey: string;
  symbol: string;
  side: OrderSide;
  status: AutomationSignalStatus;
  reason: string | null;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationGuardrail = {
  userEmail: string;
  strategy: string;
  enabled: boolean;
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  updatedAt: string;
};

export type SignalStatus = "ACTIVE" | "EXPIRED" | "INVALIDATED";
export type StrategyName =
  | "TREND_PULLBACK"
  | "RELATIVE_STRENGTH_BREAKOUT"
  | "OVERSOLD_BOUNCE";

export type SignalItem = {
  id: string;
  symbol: string;
  strategyName: StrategyName;
  status: SignalStatus;
  confidence: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  timeHorizon: string | null;
  reason: string;
  signalDate: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScanSignalsSummary = {
  strategyName: StrategyName;
  scannedSymbols: number;
  qualifiedSignals: number;
  upsertedSignals: number;
  expiredSignals: number;
  skippedSymbols: number;
  matches: ScannerResultRow[];
  watchlist: ScannerResultRow[];
  scanned: ScannerResultRow[];
  summary: {
    totalScanned: number;
    strongCount: number;
    watchlistCount: number;
    weakCount: number;
    ignoreCount: number;
  };
  asOf: string;
};

export type ScanHistoryItem = {
  id: string;
  strategyName: StrategyName;
  scannedSymbols: number;
  qualifiedSignals: number;
  upsertedSignals: number;
  expiredSignals: number;
  skippedSymbols: number;
  summary: {
    totalScanned: number;
    strongCount: number;
    watchlistCount: number;
    weakCount: number;
    ignoreCount: number;
  };
  blockerCounts: Array<{
    reason: string;
    count: number;
  }>;
  createdAt: string;
};

export type ScannerResultRow = {
  symbol: string;
  grade: "STRONG" | "WATCHLIST" | "WEAK" | "IGNORE";
  tags: string[];
  explanation: string;
  reasons: string[];
};

export type MarketStateValue =
  | "TRENDING_BULL"
  | "PULLBACK_RESET"
  | "BEARISH_WEAK"
  | "CHOPPY_MIXED";
export type VolatilityRegime = "CALM" | "NORMAL" | "ELEVATED" | "UNKNOWN";
export type BreadthState = "STRONG" | "MIXED" | "WEAK";
export type GuidanceLevel = "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE";

export type MarketStateResponse = {
  state: MarketStateValue;
  label: string;
  summary: string;
  conditions: string[];
  strategyGuidance: {
    trendPullback: GuidanceLevel;
    relativeStrengthBreakout: GuidanceLevel;
    oversoldBounce: GuidanceLevel;
  };
  volatilityRegime: VolatilityRegime;
  breadthState: BreadthState;
};

export type TriggerAutomationRunBody = {
  strategy: string;
  signals: Array<{
    symbolId: string;
    symbol: string;
    side: OrderSide;
    signalAt: string;
    quantity: number;
  }>;
};

export function getMarketSummary(): Promise<MarketSummaryItem[]> {
  return apiGet<MarketSummaryItem[]>("/dashboard/market-summary");
}

export function getMarketState(): Promise<MarketStateResponse> {
  return apiGet<MarketStateResponse>("/market-state");
}

export function getSymbolDailyBars(
  symbol: string,
  limit: number,
): Promise<DailyBar[]> {
  return apiGet<DailyBar[]>(
    `/market-data/${encodeURIComponent(symbol)}/bars?limit=${limit}`,
  );
}

export function getPortfolioSummary(): Promise<PortfolioSummary> {
  return apiGet<PortfolioSummary>("/portfolio/summary");
}

export function getPortfolioPositions(): Promise<PortfolioPosition[]> {
  return apiGet<PortfolioPosition[]>("/portfolio/positions");
}

export function listOrders(params?: {
  signalId?: string;
  limit?: number;
}): Promise<OrderListItem[]> {
  const query = new URLSearchParams();
  if (params?.signalId?.trim()) {
    query.set("signalId", params.signalId.trim());
  }
  if (params?.limit != null) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiGet<OrderListItem[]>(`/orders${suffix}`);
}

export function placeOrder(body: PlaceOrderBody): Promise<PlaceOrderResponse> {
  return apiPost<PlaceOrderResponse, PlaceOrderBody>("/orders", body);
}

export function getStopLossSuggestion(
  symbol: string,
  lookback = 20,
): Promise<StopLossSuggestion> {
  return apiGet<StopLossSuggestion>(
    `/orders/stop-suggestion?symbol=${encodeURIComponent(
      symbol.trim().toUpperCase(),
    )}&lookback=${lookback}`,
  );
}

export function cancelOrder(orderId: string): Promise<CancelOrderResponse> {
  return apiPost<CancelOrderResponse>(`/orders/${orderId}/cancel`);
}

export function listAutomationRuns(): Promise<AutomationRunListItem[]> {
  return apiGet<AutomationRunListItem[]>("/automation/runs");
}

export function triggerAutomationRun(
  body: TriggerAutomationRunBody,
): Promise<unknown> {
  return apiPost<unknown, TriggerAutomationRunBody>("/automation/runs", body);
}

export function listAutomationRunSignals(
  runId: string,
): Promise<AutomationRunSignal[]> {
  return apiGet<AutomationRunSignal[]>(`/automation/runs/${runId}/signals`);
}

export function getAutomationGuardrail(
  strategy: string,
): Promise<AutomationGuardrail> {
  return apiGet<AutomationGuardrail>(`/automation/guardrails/${strategy}`);
}

export function scanSignals(
  strategyName: StrategyName = "TREND_PULLBACK",
): Promise<ScanSignalsSummary> {
  const query = new URLSearchParams({ strategyName });
  return apiPost<ScanSignalsSummary>(`/signals/scan?${query.toString()}`);
}

export function listScanHistory(params?: {
  strategyName?: StrategyName;
  limit?: number;
}): Promise<ScanHistoryItem[]> {
  const query = new URLSearchParams();
  if (params?.strategyName) query.set("strategyName", params.strategyName);
  if (params?.limit != null) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiGet<ScanHistoryItem[]>(`/signals/scan-history${suffix}`);
}

export function listSignals(params?: {
  status?: SignalStatus;
  strategyName?: StrategyName;
  symbol?: string;
}): Promise<SignalItem[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.strategyName) query.set("strategyName", params.strategyName);
  if (params?.symbol) query.set("symbol", params.symbol.trim().toUpperCase());
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiGet<SignalItem[]>(`/signals${suffix}`);
}

export function getSignalById(signalId: string): Promise<SignalItem> {
  return apiGet<SignalItem>(`/signals/${encodeURIComponent(signalId.trim())}`);
}

export type TrackedSymbolRow = {
  id: string;
  ticker: string;
  name: string | null;
  isActive: boolean;
  universeType: UniverseType;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function addTrackedSymbol(ticker: string): Promise<TrackedSymbolRow> {
  return apiPost<TrackedSymbolRow, { ticker: string }>("/symbols", {
    ticker: ticker.trim().toUpperCase(),
  });
}

export function listTrackedSymbols(): Promise<TrackedSymbolRow[]> {
  return apiGet<TrackedSymbolRow[]>("/symbols");
}
