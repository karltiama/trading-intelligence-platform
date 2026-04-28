/**
 * Default universe for bootstrap + full default sync. Adjust here only; callers import this list.
 */
export const DEFAULT_SYNC_SYMBOLS = [
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
] as const;

export const DEFAULT_SYNC_BAR_LIMIT = 365;
