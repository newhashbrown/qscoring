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

/**
 * True when the given instant falls on a US trading day (Mon–Fri in ET).
 * Holidays are intentionally ignored — same scope decision as
 * marketCloseDate(): worst case is a wasted run on a holiday, not a
 * corrupted snapshot.
 */
export function isUsTradingDay(date: Date): boolean {
  const weekday = WEEKDAY_ET.format(date);
  return weekday !== "Sat" && weekday !== "Sun";
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
