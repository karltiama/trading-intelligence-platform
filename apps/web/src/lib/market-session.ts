const US_MARKET_TIMEZONE = "America/New_York";

function etParts(now: Date): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: US_MARKET_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  return {
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
}

/** Regular US equity session: Mon–Fri 9:30–16:00 Eastern. */
export function isUsMarketSessionOpen(now = new Date()): boolean {
  const { weekday, hour, minute } = etParts(now);
  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }

  const minutesSinceMidnight = hour * 60 + minute;
  const sessionOpen = 9 * 60 + 30;
  const sessionClose = 16 * 60;
  return minutesSinceMidnight >= sessionOpen && minutesSinceMidnight < sessionClose;
}

export function formatMarkAsOf(iso: string | null): string {
  if (!iso) {
    return "";
  }
  return new Date(iso).toLocaleString("en-US", {
    timeZone: US_MARKET_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
