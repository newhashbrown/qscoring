/**
 * Convert a generated-at ISO timestamp into the US market close date the
 * snapshot reflects.
 *
 * The picks build runs around 09:30 UTC = ~5:30am ET — before the market
 * has even opened. Showing the raw UTC date in the UI makes the snapshot
 * look like it's "from tomorrow" to anyone east-coast or central, since
 * UTC is already past midnight. The data actually reflects the prior US
 * market close.
 *
 * Logic:
 *   - Convert the ISO timestamp to America/New_York wall-clock time.
 *   - If ET time is at or after 16:00 (market close), the snapshot
 *     captures *today's* close.
 *   - If before 16:00, it captures the previous trading day's close.
 *   - Roll back through weekends (Sat/Sun → Fri).
 *
 * US market holidays are intentionally ignored for now — the resulting
 * date would still be a valid trading day in the recent past, just possibly
 * one trading session stale. Worth refining when the universe-stats
 * pipeline learns the NYSE calendar.
 */

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const DISPLAY_FORMATTER_SHORT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function isoFromUtcParts(year: number, month0: number, day: number): string {
  // month0 is zero-indexed for Date.UTC. Output is YYYY-MM-DD only.
  return new Date(Date.UTC(year, month0, day))
    .toISOString()
    .split("T")[0];
}

/**
 * Returns the YYYY-MM-DD of the US trading day this snapshot's data
 * reflects. Stable across re-renders because it's derived from the input
 * timestamp, not from the current wall-clock time.
 */
export function marketCloseDate(generatedAtIso: string): string {
  const parts = ET_PARTS.formatToParts(new Date(generatedAtIso)).reduce(
    (acc, p) => {
      acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>
  );

  const etYear = parseInt(parts.year, 10);
  const etMonth = parseInt(parts.month, 10);
  const etDay = parseInt(parts.day, 10);
  const etHour = parseInt(parts.hour, 10);

  // Walk a UTC-anchored Date through ET-relative day arithmetic. Using UTC
  // for the date object avoids local-tz drift on server runtimes that may
  // be in any timezone.
  const target = new Date(Date.UTC(etYear, etMonth - 1, etDay));
  if (etHour < 16) {
    target.setUTCDate(target.getUTCDate() - 1);
  }
  while (target.getUTCDay() === 6 || target.getUTCDay() === 0) {
    target.setUTCDate(target.getUTCDate() - 1);
  }

  return isoFromUtcParts(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate()
  );
}

/**
 * Returns "May 8, 2026" given a YYYY-MM-DD date string. Identical SSR/CSR
 * output because the formatter pins to UTC.
 */
export function formatMarketDate(yyyymmdd: string): string {
  return DISPLAY_FORMATTER.format(new Date(`${yyyymmdd}T12:00:00Z`));
}

/**
 * Returns "May 8, 2026" given a YYYY-MM-DD date string in the short form
 * (Sep, Oct etc.). Same SSR/CSR-stability property.
 */
export function formatMarketDateShort(yyyymmdd: string): string {
  return DISPLAY_FORMATTER_SHORT.format(new Date(`${yyyymmdd}T12:00:00Z`));
}

/**
 * Convenience: ISO timestamp → "May 8, 2026 market close" caption ready
 * to embed in user-facing copy.
 */
export function marketCloseLabel(generatedAtIso: string): string {
  return `${formatMarketDate(marketCloseDate(generatedAtIso))} market close`;
}
