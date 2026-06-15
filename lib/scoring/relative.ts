/**
 * Relative-context attachment (Phase 4).
 *
 * For each scored metric, computes where the raw value ranks vs the stock's
 * sector cohort and vs the whole universe, using the quantile breakpoints in
 * universe-stats.json (honest ECDF, not normal-CDF — see percentile.ts) and
 * the same sector-vs-universe reference the score itself used.
 *
 * Degrades cleanly: when the bundled universe-stats predates quantiles, every
 * field is null and the UI simply hides the percentiles.
 */

import { getRelativeStats, type MetricKey } from "./zscore";
import { percentileRank } from "./percentile";
import type { CategoryScore, MetricRelative } from "./types";

// Maps each metric's display name (from score.ts) to its stats key and the
// direction that makes a HIGHER raw value more favorable:
//   "higher" — bigger is better (ROE, growth, returns, margins, FCF yield)
//   "lower"  — smaller is better (valuation multiples, volatility)
//   "none"   — distance-scored / non-monotonic / binary (Beta, RSI, MA cross):
//              a raw-value percentile would contradict the score, so we keep
//              the sector/universe LABEL but emit no percentile.
type Direction = "higher" | "lower" | "none";
const METRIC_META_BY_NAME: Record<string, { key: MetricKey; direction: Direction }> = {
  "P/E": { key: "pe", direction: "lower" },
  "P/B": { key: "pb", direction: "lower" },
  "P/S": { key: "ps", direction: "lower" },
  "EV/EBITDA": { key: "evEbitda", direction: "lower" },
  "Revenue Growth": { key: "revenueGrowth", direction: "higher" },
  "EPS Growth": { key: "epsGrowth", direction: "higher" },
  "FCF Growth": { key: "fcfGrowth", direction: "higher" },
  "12-Month Return": { key: "return12mo", direction: "higher" },
  "3-Month Return": { key: "return3mo", direction: "higher" },
  "1-Month Return": { key: "return1mo", direction: "higher" },
  "RSI (14)": { key: "rsi14", direction: "none" },
  "50/200 MA": { key: "maCross", direction: "none" },
  ROE: { key: "roe", direction: "higher" },
  ROA: { key: "roa", direction: "higher" },
  "Gross Margin": { key: "grossMargin", direction: "higher" },
  "Operating Margin": { key: "operatingMargin", direction: "higher" },
  "Net Margin": { key: "netMargin", direction: "higher" },
  "FCF Yield": { key: "fcfYield", direction: "higher" },
  Beta: { key: "beta", direction: "none" },
  "60-Day Volatility": { key: "vol60", direction: "lower" },
};

// Orient a raw-position percentile so a HIGHER number always means MORE
// favorable — otherwise "94th percentile" reads as top-of-class next to a P/B
// that's actually the most expensive in its sector. "none" → no percentile.
function orient(positionPct: number | null, direction: Direction): number | null {
  if (positionPct === null || direction === "none") return null;
  return direction === "lower" ? 100 - positionPct : positionPct;
}

export function metricRelative(
  key: MetricKey,
  raw: number | null,
  sector: string | null,
  direction: Direction
): MetricRelative {
  const r = getRelativeStats(key, sector);
  const sectorPos = r.levels ? percentileRank(raw, r.sectorBreakpoints, r.levels) : null;
  const universePos = r.levels ? percentileRank(raw, r.universeBreakpoints, r.levels) : null;
  return {
    sectorPercentile: orient(sectorPos, direction),
    universePercentile: orient(universePos, direction),
    scoredAgainst: r.scoredAgainst,
    sectorSize: r.sectorSize,
  };
}

/** Immutably attach relative context to every mappable metric in the cards. */
export function attachRelativeContext(
  categories: readonly CategoryScore[],
  sector: string | null
): CategoryScore[] {
  return categories.map((c) => ({
    ...c,
    metrics: c.metrics.map((m) => {
      const meta = METRIC_META_BY_NAME[m.name];
      return meta ? { ...m, relative: metricRelative(meta.key, m.raw, sector, meta.direction) } : m;
    }),
  }));
}

// Exported for the test that guards the name→key map against score.ts drift.
export const MAPPED_METRIC_NAMES = Object.keys(METRIC_META_BY_NAME);
