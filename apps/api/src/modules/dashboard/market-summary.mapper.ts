import type { SymbolLatestBars } from '../market-data/market-data.repository';
import type { MarketSummaryRow } from './dashboard.types';

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

function trendFromChange(changePercent: number): MarketSummaryRow['trend'] {
  if (changePercent > 0) {
    return 'Bullish';
  }
  if (changePercent < 0) {
    return 'Bearish';
  }
  return 'Neutral';
}

export function mapSymbolLatestBarsToSummary(
  row: SymbolLatestBars,
): MarketSummaryRow {
  const close = row.latestClose.toNumber();
  const volume = Math.round(row.latestVolume.toNumber());

  let changePercent = 0;
  if (row.previousClose !== null) {
    const prev = row.previousClose.toNumber();
    if (prev !== 0) {
      changePercent = roundTwo(((close - prev) / prev) * 100);
    }
  }

  return {
    symbol: row.ticker,
    asOf: row.latestDate.toISOString(),
    close: roundTwo(close),
    changePercent,
    volume,
    trend: trendFromChange(changePercent),
  };
}
