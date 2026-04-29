import { DEFAULT_SYNC_SYMBOLS } from './market-data.constants';

describe('DEFAULT_SYNC_SYMBOLS', () => {
  it('includes the starter US equity / ETF universe', () => {
    expect(DEFAULT_SYNC_SYMBOLS.length).toBe(10);
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
});
