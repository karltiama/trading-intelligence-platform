import { Timeframe } from '@prisma/client';

/** Prisma timeframe for hourly tactical cache rows. */
export const H1_TIMEFRAME = Timeframe.H1;

/** CORE symbols: sync/prune window in calendar days. */
export const H1_CORE_LOOKBACK_CALENDAR_DAYS = 90;

/** ON_DEMAND symbols: sync/prune window when ensure=true. */
export const H1_ON_DEMAND_LOOKBACK_CALENDAR_DAYS = 30;

/** Hard cap on stored H1 rows per symbol after prune. */
export const H1_MAX_BARS_PER_SYMBOL = 650;

/** GET hourly-bars?ensure=true refresh threshold. */
export const H1_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Overlap when incremental sync starts before latest stored bar. */
export const H1_INCREMENTAL_OVERLAP_MS = 2 * 60 * 60 * 1000;

export const H1_ALPACA_TIMEFRAME = '1Hour';

/** Server-side cap for GET hourly-bars limit query param. */
export const H1_MAX_QUERY_LIMIT = 500;

export type HourlySyncPolicy = 'CORE' | 'ON_DEMAND';

export function hourlyLookbackDaysForPolicy(policy: HourlySyncPolicy): number {
  return policy === 'CORE'
    ? H1_CORE_LOOKBACK_CALENDAR_DAYS
    : H1_ON_DEMAND_LOOKBACK_CALENDAR_DAYS;
}

export function utcCutoffDaysAgo(days: number): Date {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}
