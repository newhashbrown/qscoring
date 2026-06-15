/**
 * Tier 1a "company snapshot header" computed fields.
 *
 * Pure functions only — no FMP calls here. They take already-fetched payloads
 * (profile, ratios-ttm, shares-float, price history) and derive the header
 * scalars the /score/[ticker] page renders and the daily ledger persists.
 * Keeping the math here (and FMP I/O in score.ts) is what makes these unit
 * testable without network mocks, matching the factor-test pattern in
 * zscore.test.ts / momentum-factor.test.ts.
 */

import type { PricePoint } from "./fmp";
import type { CompanyHeader, SizeBucket } from "./types";

// Conventional US-equity market-cap tiers, in USD. Boundaries are inclusive on
// the lower bound (≥) so a stock sitting exactly on a threshold lands in the
// larger bucket — the same convention index providers use.
const SIZE_BUCKETS: ReadonlyArray<{ bucket: SizeBucket; floor: number }> = [
  { bucket: "mega", floor: 200_000_000_000 },
  { bucket: "large", floor: 10_000_000_000 },
  { bucket: "mid", floor: 2_000_000_000 },
  { bucket: "small", floor: 300_000_000 },
  { bucket: "micro", floor: 0 },
];

// Trailing window (trading days) for the average daily dollar-volume figure.
const DOLLAR_VOLUME_WINDOW = 20;

export function sizeBucket(marketCap: number | null | undefined): SizeBucket | null {
  if (marketCap === null || marketCap === undefined || !Number.isFinite(marketCap)) {
    return null;
  }
  if (marketCap < 0) return null;
  for (const { bucket, floor } of SIZE_BUCKETS) {
    if (marketCap >= floor) return bucket;
  }
  return null;
}

/**
 * Average daily *dollar* volume over the most recent `days` bars.
 *
 * `history` is most-recent-first (FMP /historical-price-eod/light order, the
 * same ordering score.ts relies on when it slices index 1 for "yesterday").
 * Bars with a non-finite or non-positive price/volume are skipped rather than
 * poisoning the average; returns null when no usable bar exists.
 */
export function avgDollarVolume(
  history: readonly PricePoint[] | null | undefined,
  days: number = DOLLAR_VOLUME_WINDOW
): number | null {
  if (!history || history.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const bar of history.slice(0, days)) {
    const price = bar?.price;
    const volume = bar?.volume;
    if (!Number.isFinite(price) || !Number.isFinite(volume)) continue;
    if (price <= 0 || volume <= 0) continue;
    sum += price * volume;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

/**
 * Parse FMP's profile `range` string ("195.07-317.4") into low/high numbers.
 * Returns null on any malformed input — prices are always positive, so a bare
 * "-" split is unambiguous.
 */
export function parse52WeekRange(
  range: string | null | undefined
): { low: number; high: number } | null {
  if (typeof range !== "string") return null;
  const parts = range.split("-").map((p) => Number(p.trim()));
  if (parts.length !== 2) return null;
  const [low, high] = parts;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low <= 0 || high <= 0 || high < low) return null;
  return { low, high };
}

export type CompanyHeaderInputs = {
  marketCap: number | null | undefined;
  sharesOutstanding: number | null | undefined;
  floatShares: number | null | undefined;
  freeFloatPercent: number | null | undefined;
  dividendYield: number | null | undefined; // fraction (0.0042 = 0.42%)
  range52Week: string | null | undefined;
  history: readonly PricePoint[] | null | undefined;
};

/** Assemble the full CompanyHeader from already-fetched payload fields. */
export function buildCompanyHeader(input: CompanyHeaderInputs): CompanyHeader {
  const marketCap = finiteOrNull(input.marketCap);
  const range = parse52WeekRange(input.range52Week);
  return {
    marketCap,
    sharesOutstanding: finiteOrNull(input.sharesOutstanding),
    floatShares: finiteOrNull(input.floatShares),
    freeFloatPercent: finiteOrNull(input.freeFloatPercent),
    avgDollarVolume20: avgDollarVolume(input.history),
    week52High: range?.high ?? null,
    week52Low: range?.low ?? null,
    dividendYield: finiteOrNull(input.dividendYield),
    sizeBucket: sizeBucket(marketCap),
  };
}

function finiteOrNull(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
}
