/**
 * Normalize an ISO timestamp to the UTC calendar date (Postgres DATE / Prisma @db.Date).
 */
export function utcCalendarDateFromIso(iso: string): Date {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
