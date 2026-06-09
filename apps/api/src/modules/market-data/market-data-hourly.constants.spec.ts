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
});
