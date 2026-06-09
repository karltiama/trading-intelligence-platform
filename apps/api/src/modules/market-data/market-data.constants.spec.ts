import {
  DEFAULT_SYNC_BAR_LIMIT,
  DEFAULT_SYNC_SYMBOLS,
} from './market-data.constants';

describe('DEFAULT_SYNC_SYMBOLS', () => {
  it('includes the starter US equity / ETF universe', () => {
    expect(DEFAULT_SYNC_SYMBOLS.length).toBe(49);
    expect(new Set(DEFAULT_SYNC_SYMBOLS).size).toBe(
      DEFAULT_SYNC_SYMBOLS.length,
    );
    expect(DEFAULT_SYNC_SYMBOLS).toEqual(
      expect.arrayContaining([
        'AAPL',
        'MSFT',
        'SPY',
        'QQQ',
        'NVDA',
        'META',
        'AMZN',
        'GOOGL',
        'TSLA',
        'AMD',
      ]),
    );
  });

  it('daily sync limit covers scanner minimum history (200 bars)', () => {
    expect(DEFAULT_SYNC_BAR_LIMIT).toBeGreaterThanOrEqual(200);
  });
});
