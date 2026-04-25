export type MarketSummaryRow = {
  symbol: string;
  asOf: string;
  close: number;
  changePercent: number;
  volume: number;
  trend: 'Bullish' | 'Bearish' | 'Neutral';
};
