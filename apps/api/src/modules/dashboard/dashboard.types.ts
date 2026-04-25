export type MarketSummaryRow = {
  symbol: string;
  close: number;
  changePercent: number;
  volume: number;
  trend: 'Bullish' | 'Bearish' | 'Neutral';
};
