import { DEFAULT_SYNC_SYMBOLS } from './market-data.constants';
import {
  H1_CORE_LOOKBACK_CALENDAR_DAYS,
  H1_MAX_BARS_PER_SYMBOL,
  H1_ON_DEMAND_LOOKBACK_CALENDAR_DAYS,
  hourlyLookbackDaysForPolicy,
  utcCutoffDaysAgo,
} from './market-data-hourly.constants';

describe('market-data-hourly.constants', () => {
  it('maps sync policy to lookback days', () => {
    expect(hourlyLookbackDaysForPolicy('CORE')).toBe(
      H1_CORE_LOOKBACK_CALENDAR_DAYS,
    );
    expect(hourlyLookbackDaysForPolicy('ON_DEMAND')).toBe(
      H1_ON_DEMAND_LOOKBACK_CALENDAR_DAYS,
    );
  });

  it('utcCutoffDaysAgo returns a date in the past', () => {
    const cutoff = utcCutoffDaysAgo(90);
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });

  it('keeps H1 bar cap within expected MVP budget', () => {
    expect(H1_MAX_BARS_PER_SYMBOL).toBeLessThanOrEqual(700);
  });

  it('documents CORE universe H1 row budget (~symbols × max bars)', () => {
    const coreSymbolCount = DEFAULT_SYNC_SYMBOLS.length;
    const maxCoreRows = coreSymbolCount * H1_MAX_BARS_PER_SYMBOL;
    // ~49 CORE × 650 ≈ 31.8k rows — trivial for Postgres; guard against accidental scale-up.
    expect(maxCoreRows).toBeLessThanOrEqual(35_000);
    expect(maxCoreRows).toBeGreaterThan(0);
  });

  it('ON_DEMAND lookback is shorter than CORE', () => {
    expect(H1_ON_DEMAND_LOOKBACK_CALENDAR_DAYS).toBeLessThan(
      H1_CORE_LOOKBACK_CALENDAR_DAYS,
    );
  });
});
