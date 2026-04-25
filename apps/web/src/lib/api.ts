export type MarketSummaryItem = {
  symbol: string;
  close: number;
  changePercent: number;
  volume: number;
  trend: "Bullish" | "Bearish" | "Neutral";
  lastDate?: string;
};

const DEFAULT_API_URL = "http://localhost:3001";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

export async function getMarketSummary(): Promise<MarketSummaryItem[]> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/dashboard/market-summary`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch market summary (${response.status} ${response.statusText})`,
    );
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new Error("Unexpected market summary payload.");
  }

  return payload as MarketSummaryItem[];
}
