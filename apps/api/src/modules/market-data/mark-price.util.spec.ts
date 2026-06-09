import { resolveSymbolMarkPrice } from './mark-price.util';

describe('resolveSymbolMarkPrice', () => {
  const now = new Date('2026-06-09T15:00:00.000Z').getTime();

  it('prefers fresh hourly close over daily', () => {
    const result = resolveSymbolMarkPrice({
      hourly: { close: 105, timestamp: new Date('2026-06-09T14:00:00.000Z') },
      daily: { close: 100, date: new Date('2026-06-08T00:00:00.000Z') },
      nowMs: now,
      staleAfterMs: 2 * 60 * 60 * 1000,
    });
    expect(result?.source).toBe('H1');
    expect(result?.close).toBe(105);
  });

  it('falls back to daily when hourly is stale', () => {
    const result = resolveSymbolMarkPrice({
      hourly: { close: 105, timestamp: new Date('2026-06-09T10:00:00.000Z') },
      daily: { close: 100, date: new Date('2026-06-08T00:00:00.000Z') },
      nowMs: now,
      staleAfterMs: 2 * 60 * 60 * 1000,
    });
    expect(result?.source).toBe('D1');
    expect(result?.close).toBe(100);
  });

  it('returns null when no prices exist', () => {
    expect(
      resolveSymbolMarkPrice({
        hourly: null,
        daily: null,
        nowMs: now,
      }),
    ).toBeNull();
  });
});
