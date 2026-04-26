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
};

export type PlaceOrderBody = {
  symbol: string;
  side: OrderSide;
  quantity: number;
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

export function getPortfolioSummary(): Promise<PortfolioSummary> {
  return apiGet<PortfolioSummary>("/portfolio/summary");
}

export function getPortfolioPositions(): Promise<PortfolioPosition[]> {
  return apiGet<PortfolioPosition[]>("/portfolio/positions");
}

export function listOrders(): Promise<OrderListItem[]> {
  return apiGet<OrderListItem[]>("/orders");
}

export function placeOrder(body: PlaceOrderBody): Promise<PlaceOrderResponse> {
  return apiPost<PlaceOrderResponse, PlaceOrderBody>("/orders", body);
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
