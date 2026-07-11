/**
 * Catalyst calendar — event types + pure FMP→event mappers (Phase 4).
 *
 * PURE (no I/O): the ingest script fetches FMP calendars and calls these to
 * normalize + validate rows; the persist route re-validates. Kept unit-testable
 * with fixture rows. The table stores only UPCOMING events (see migration 0012).
 */

export const EVENT_TYPES = ["earnings", "ex_dividend", "split"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type EarningsDetails = { epsEstimated: number | null; revenueEstimated: number | null };
export type DividendDetails = { dividend: number | null; paymentDate: string | null };
export type SplitDetails = { numerator: number | null; denominator: number | null };
export type EventDetails = EarningsDetails | DividendDetails | SplitDetails;

export type TickerEvent = {
  ticker: string;
  eventType: EventType;
  eventDate: string; // YYYY-MM-DD
  details: EventDetails;
};

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** FMP dates arrive as "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"; keep the date part. */
function normDate(d: unknown): string | null {
  if (typeof d !== "string") return null;
  const date = d.trim().slice(0, 10);
  return DATE_RE.test(date) ? date : null;
}

function normTicker(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ── FMP calendar row shapes (loose — fields vary by plan) ───────────────────
export type FmpEarningsRow = {
  symbol?: unknown;
  date?: unknown;
  epsEstimated?: unknown;
  revenueEstimated?: unknown;
};
export type FmpDividendRow = {
  symbol?: unknown;
  date?: unknown; // ex-dividend date
  dividend?: unknown;
  adjDividend?: unknown;
  paymentDate?: unknown;
};
export type FmpSplitRow = {
  symbol?: unknown;
  date?: unknown;
  numerator?: unknown;
  denominator?: unknown;
};

export function mapEarnings(rows: FmpEarningsRow[]): TickerEvent[] {
  const out: TickerEvent[] = [];
  for (const r of rows ?? []) {
    const ticker = normTicker(r.symbol);
    const eventDate = normDate(r.date);
    if (!ticker || !eventDate) continue;
    out.push({
      ticker,
      eventType: "earnings",
      eventDate,
      details: { epsEstimated: num(r.epsEstimated), revenueEstimated: num(r.revenueEstimated) },
    });
  }
  return out;
}

export function mapDividends(rows: FmpDividendRow[]): TickerEvent[] {
  const out: TickerEvent[] = [];
  for (const r of rows ?? []) {
    const ticker = normTicker(r.symbol);
    const eventDate = normDate(r.date); // the ex-dividend date
    if (!ticker || !eventDate) continue;
    out.push({
      ticker,
      eventType: "ex_dividend",
      eventDate,
      details: { dividend: num(r.dividend) ?? num(r.adjDividend), paymentDate: normDate(r.paymentDate) },
    });
  }
  return out;
}

export function mapSplits(rows: FmpSplitRow[]): TickerEvent[] {
  const out: TickerEvent[] = [];
  for (const r of rows ?? []) {
    const ticker = normTicker(r.symbol);
    const eventDate = normDate(r.date);
    if (!ticker || !eventDate) continue;
    out.push({
      ticker,
      eventType: "split",
      eventDate,
      details: { numerator: num(r.numerator), denominator: num(r.denominator) },
    });
  }
  return out;
}

/** Keep only events in the universe that fall on/after `asOf` (YYYY-MM-DD). */
export function filterUpcoming(events: TickerEvent[], universe: Set<string>, asOf: string): TickerEvent[] {
  return events.filter((e) => e.eventDate >= asOf && universe.has(e.ticker));
}

/** Validate a persisted-shape row (used by the persist route as defense-in-depth). */
export function isValidEventRow(row: {
  ticker?: unknown;
  eventType?: unknown;
  eventDate?: unknown;
}): boolean {
  return (
    normTicker(row.ticker) !== null &&
    typeof row.eventType === "string" &&
    (EVENT_TYPES as readonly string[]).includes(row.eventType) &&
    normDate(row.eventDate) !== null
  );
}

/** Human split-ratio label, e.g. {4,1} → "4:1"; null when incomplete. */
export function splitRatio(d: SplitDetails): string | null {
  if (!(d.numerator && d.denominator)) return null;
  return `${d.numerator}:${d.denominator}`;
}
