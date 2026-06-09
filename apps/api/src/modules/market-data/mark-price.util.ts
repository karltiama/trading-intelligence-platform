import { H1_STALE_AFTER_MS } from './market-data-hourly.constants';

export type MarkPriceSource = 'H1' | 'D1';

export type ResolvedMarkPrice = {
  close: number;
  asOf: Date;
  source: MarkPriceSource;
};

export function resolveSymbolMarkPrice(input: {
  hourly: { close: number; timestamp: Date } | null;
  daily: { close: number; date: Date } | null;
  nowMs?: number;
  staleAfterMs?: number;
}): ResolvedMarkPrice | null {
  const nowMs = input.nowMs ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? H1_STALE_AFTER_MS;

  if (
    input.hourly &&
    nowMs - input.hourly.timestamp.getTime() <= staleAfterMs
  ) {
    return {
      close: input.hourly.close,
      asOf: input.hourly.timestamp,
      source: 'H1',
    };
  }

  if (input.daily) {
    return {
      close: input.daily.close,
      asOf: input.daily.date,
      source: 'D1',
    };
  }

  return null;
}
