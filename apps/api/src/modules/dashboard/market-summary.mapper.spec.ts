import { Prisma } from '@prisma/client';
import type { SymbolLatestBars } from '../market-data/market-data.repository';
import { mapSymbolLatestBarsToSummary } from './market-summary.mapper';

describe('mapSymbolLatestBarsToSummary', () => {
  it('marks bullish when close rose vs previous day', () => {
    const row: SymbolLatestBars = {
      ticker: 'AAPL',
      latestDate: new Date('2026-04-24T00:00:00.000Z'),
      latestClose: new Prisma.Decimal(212.44),
      latestVolume: new Prisma.Decimal(58_200_000),
      previousClose: new Prisma.Decimal(210),
    };
    const out = mapSymbolLatestBarsToSummary(row);
    expect(out.symbol).toBe('AAPL');
    expect(out.asOf).toBe('2026-04-24T00:00:00.000Z');
    expect(out.close).toBe(212.44);
    expect(out.changePercent).toBe(1.16);
    expect(out.volume).toBe(58_200_000);
    expect(out.trend).toBe('Bullish');
  });

  it('uses neutral when no prior close', () => {
    const row: SymbolLatestBars = {
      ticker: 'XYZ',
      latestDate: new Date('2026-04-25T00:00:00.000Z'),
      latestClose: new Prisma.Decimal(10),
      latestVolume: new Prisma.Decimal(1000),
      previousClose: null,
    };
    const out = mapSymbolLatestBarsToSummary(row);
    expect(out.asOf).toBe('2026-04-25T00:00:00.000Z');
    expect(out.changePercent).toBe(0);
    expect(out.trend).toBe('Neutral');
  });
});
