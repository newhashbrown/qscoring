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
 *   - Roll back through weekends AND NYSE holidays to the prior trading day.
 *
 * NYSE full-closure holidays are honored via NYSE_HOLIDAYS_OBSERVED (issue
 * #48). Before that, a holiday weekday was treated as a trading day, so the
 * pipeline minted snapshots dated to closures (e.g. Juneteenth 2026-06-19).
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
 * NYSE full-closure holidays as OBSERVED calendar dates (YYYY-MM-DD) — the
 * weekend shift is already baked in (e.g. Independence Day 2026 lands on a
 * Saturday, so the closure is 2026-07-03). Transcribed from the NYSE published
 * holiday calendar (nyse.com/markets/hours-calendars), NOT computed, so the
 * observance edge cases (New-Year's-on-Saturday non-observance, the Juneteenth
 * start year, Good Friday) are copied outcomes rather than re-derived rules.
 *
 * Early-close HALF-DAYS (1pm ET, e.g. the day after Thanksgiving) are
 * deliberately excluded: the market is open and settles a real close, so for
 * the snapshot pipeline they are ordinary trading days.
 *
 * The pipeline only queries dates near "now", so this need only stay ~a year
 * ahead of today. EXTEND it (and NYSE_HOLIDAY_TABLE_THROUGH) when NYSE
 * publishes the next year; a CI test fails as today nears the horizon so an
 * unlisted holiday can't silently become a trading day again (issue #48).
 */
const NYSE_HOLIDAYS_OBSERVED: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King, Jr. Day
  "2026-02-16", // Washington's Birthday
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed; Jul 4 is a Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day
  // 2027
  "2027-01-01", // New Year's Day
  "2027-01-18", // Martin Luther King, Jr. Day
  "2027-02-15", // Washington's Birthday
  "2027-03-26", // Good Friday
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth (observed; Jun 19 is a Saturday)
  "2027-07-05", // Independence Day (observed; Jul 4 is a Sunday)
  "2027-09-06", // Labor Day
  "2027-11-25", // Thanksgiving Day
  "2027-12-24", // Christmas Day (observed; Dec 25 is a Saturday)
]);

/**
 * Last calendar date NYSE_HOLIDAYS_OBSERVED is known-good through. Keep in
 * sync with the table; the CI rot-guard test (market-date.test.ts) fails as
 * `today` approaches it so the table is extended before the pipeline treats
 * an unlisted holiday as a trading day again (issue #48).
 */
export const NYSE_HOLIDAY_TABLE_THROUGH = "2027-12-31";

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
  // Roll back across weekends AND NYSE holidays to the prior *trading* day.
  // target's UTC Y/M/D encode the ET calendar date (built from ET parts
  // above), so isoFromUtcParts gives the string to test against the table.
  while (
    target.getUTCDay() === 6 ||
    target.getUTCDay() === 0 ||
    NYSE_HOLIDAYS_OBSERVED.has(
      isoFromUtcParts(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        target.getUTCDate()
      )
    )
  ) {
    target.setUTCDate(target.getUTCDate() - 1);
  }

  return isoFromUtcParts(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate()
  );
}

function etHour(date: Date): number {
  const parts = ET_PARTS.formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  // hour12:false can render midnight as "24" on some runtimes — normalize.
  return parseInt(h, 10) % 24;
}

/**
 * The snapshot date the 18:00 UTC recovery DETECTOR should verify — robust
 * to GitHub Actions scheduling delay.
 *
 * That detector exists only to confirm the 09:30 pre-market run landed its
 * snapshot, i.e. the prior session's settled close. marketCloseDate()
 * returns that prior-close date for any timestamp before 16:00 ET. But the
 * 18:00 UTC cron is *meant* to fire at ~14:00 ET (mid-session) and GitHub
 * routinely delays scheduled runs by hours; once it slips past 16:00 ET,
 * marketCloseDate(now) rolls the target FORWARD to today's not-yet-due
 * session and the guard false-fails ("snapshot missing"). See the
 * 2026-06-10 incident (18:00 cron fired 20:37 UTC = 16:37 ET).
 *
 * Clamp the reference back to mid-session (ET hour < 16) so the detector
 * targets the same prior-close date no matter when it actually fires, then
 * delegate to marketCloseDate() — keeping exactly one place that maps a
 * timestamp to a ledger date. Walking back in whole UTC hours and
 * re-deriving ET parts is DST-safe.
 *
 * Caveat: a delay extreme enough to cross ET midnight (~8h+, vs GitHub's
 * typical 1-3h) would advance the ET calendar day and is not handled —
 * GitHub coalesces/drops scheduled runs that stale.
 */
export function recoveryCloseDate(generatedAtIso: string): string {
  const ref = new Date(generatedAtIso);
  for (let i = 0; i < 12 && etHour(ref) >= 16; i++) {
    ref.setUTCHours(ref.getUTCHours() - 1);
  }
  return marketCloseDate(ref.toISOString());
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

const WEEKDAY_ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});

/** YYYY-MM-DD of the America/New_York calendar day `date` falls on, regardless
 *  of the host timezone. */
function etDateString(date: Date): string {
  const parts = ET_PARTS.formatToParts(date).reduce(
    (acc, p) => {
      acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * True when the ET calendar day `date` falls on is a NYSE full-closure
 * holiday. Half-days are not holidays (see NYSE_HOLIDAYS_OBSERVED).
 */
export function isNyseHoliday(date: Date): boolean {
  return NYSE_HOLIDAYS_OBSERVED.has(etDateString(date));
}

/**
 * True when the given instant falls on a US trading day: an ET weekday
 * (Mon–Fri) that is not a NYSE holiday. Before issue #48 holidays were
 * ignored, so the pipeline minted snapshots dated to closures such as
 * Juneteenth 2026-06-19.
 */
export function isUsTradingDay(date: Date): boolean {
  const weekday = WEEKDAY_ET.format(date);
  if (weekday === "Sat" || weekday === "Sun") return false;
  return !isNyseHoliday(date);
}

const REGULAR_OPEN_MINUTES = 9 * 60 + 30; // 09:30 ET
const REGULAR_CLOSE_MINUTES = 16 * 60; // 16:00 ET

/**
 * True when `date` is inside a regular US equity session — a weekday in ET
 * with the ET wall-clock at or after 09:30 and strictly before 16:00.
 *
 * The morning build's no-look-ahead contract only holds while the market is
 * CLOSED: /api/score reads price/changePercent from FMP /quote (live
 * intraday, 15-min cache; lib/scoring/score.ts), but marketCloseDate() labels
 * the snapshot with the PRIOR session. Run pre-market and "live" ≈ the prior
 * settled close, so the label is faithful. If GitHub delays the 09:30 cron
 * into the session — it fired 11:04 ET on 2026-06-22 after a 5.5h slip —
 * /quote returns live intraday prices that get frozen under the prior-day
 * label: look-ahead contamination of the append-only ledger. snapshot-guard.ts
 * uses this to REFUSE a mid-session build (fail loud; a missing snapshot
 * self-heals at the next pre-market run, a contaminated one does not — the
 * same philosophy the 18:00 recovery detector already enforces).
 *
 * Holidays are intentionally ignored, consistent with the rest of this file:
 * a weekday holiday inside 09:30–16:00 ET is (over-cautiously) refused, but
 * that is a loud no-op, not corruption, and force_run overrides it.
 */
export function isRegularSessionOpen(date: Date): boolean {
  const weekday = WEEKDAY_ET.format(date);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const parts = ET_PARTS.formatToParts(date).reduce(
    (acc, p) => {
      acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>
  );
  const minutes =
    (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10);
  return minutes >= REGULAR_OPEN_MINUTES && minutes < REGULAR_CLOSE_MINUTES;
}
