import { buildDeterministicSignalKey } from './deterministic-signal-key';

describe('buildDeterministicSignalKey', () => {
  it('creates a stable key for identical inputs', () => {
    const input = {
      strategy: 'trend-pullback',
      symbol: 'AAPL',
      side: 'BUY' as const,
      signalAt: new Date('2026-04-28T13:00:00.000Z'),
    };

    const a = buildDeterministicSignalKey(input);
    const b = buildDeterministicSignalKey(input);

    expect(a).toBe(b);
    expect(a).toBe('trend-pullback|AAPL|BUY|2026-04-28T13:00:00.000Z');
  });
});

