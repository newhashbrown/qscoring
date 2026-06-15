/**
 * Z-score normalization utilities for metric scoring.
 *
 * Each metric is converted to a z-score against a reference distribution
 * (sector or universe), then mapped to a 0-100 score with z=0 → 50,
 * z=±3 → 0/100. This replaces the heuristic piecewise mapping with
 * a parameter-light approach that's defensible in a backtest.
 */

import statsFileRaw from "@/data/universe-stats.json";

export type MetricStats = { mean: number; std: number; n: number };

export type MetricKey =
  | "pe" | "pb" | "ps" | "evEbitda"
  | "revenueGrowth" | "epsGrowth" | "fcfGrowth"
  | "roe" | "roa" | "grossMargin" | "operatingMargin" | "netMargin" | "fcfYield"
  | "return12mo" | "return3mo" | "return1mo" | "rsi14" | "maCross"
  | "beta" | "vol60";

type Quantiles = Partial<Record<MetricKey, number[]>>;
type SectorStats = {
  size: number;
  metrics: Partial<Record<MetricKey, MetricStats>>;
  quantiles?: Quantiles; // optional — present only on universe-stats built ≥ Phase 4
};

type StatsFile = {
  generatedAt: string;
  universe: { size: number; criteria: string };
  metrics: Partial<Record<MetricKey, MetricStats>>;
  sectors: Record<string, SectorStats>;
  quantileLevels?: number[]; // optional — present only ≥ Phase 4
  quantiles?: Quantiles;
};

const stats = statsFileRaw as unknown as StatsFile;

// Sectors with fewer than this many tickers fall back to universe-wide stats,
// because mean/std on a tiny sample is too noisy to be useful.
const MIN_SECTOR_SIZE = 15;

/**
 * Resolve stats for a metric, preferring the sector's distribution when the
 * sector has enough samples. Falls back to universe-wide stats otherwise.
 */
export function getStats(metric: MetricKey, sector: string | null): MetricStats | null {
  if (sector && stats.sectors[sector] && stats.sectors[sector].size >= MIN_SECTOR_SIZE) {
    const s = stats.sectors[sector].metrics[metric];
    if (s && s.std > 0) return s;
  }
  const universe = stats.metrics[metric];
  if (universe && universe.std > 0) return universe;
  return null;
}

/**
 * Breakpoints + reference for a metric's relative-context percentiles
 * (Phase 4). Mirrors getStats' sector-vs-universe decision so the label we
 * show ("scored against sector / universe") matches how the score was actually
 * computed. All fields degrade to null when the bundled universe-stats predates
 * quantiles — callers then hide percentiles rather than guess.
 */
export function getRelativeStats(
  metric: MetricKey,
  sector: string | null
): {
  sectorBreakpoints: number[] | null;
  universeBreakpoints: number[] | null;
  levels: number[] | null;
  scoredAgainst: "sector" | "universe" | null;
  sectorSize: number | null;
} {
  const levels = stats.quantileLevels ?? null;
  const universeBreakpoints = stats.quantiles?.[metric] ?? null;

  const sectorEntry = sector ? stats.sectors[sector] : undefined;
  const sectorSize = sectorEntry?.size ?? null;
  const sectorBreakpoints = sectorEntry?.quantiles?.[metric] ?? null;

  // Replicate getStats: a sector cohort that clears MIN_SECTOR_SIZE and has a
  // usable distribution is what the score used; otherwise it fell back to
  // universe-wide.
  let scoredAgainst: "sector" | "universe" | null = null;
  const sectorMetric = sectorEntry?.metrics[metric];
  if (sectorEntry && sectorEntry.size >= MIN_SECTOR_SIZE && sectorMetric && sectorMetric.std > 0) {
    scoredAgainst = "sector";
  } else if (stats.metrics[metric] && stats.metrics[metric]!.std > 0) {
    scoredAgainst = "universe";
  }

  return { sectorBreakpoints, universeBreakpoints, levels, scoredAgainst, sectorSize };
}

export function getUniverseInfo() {
  return {
    size: stats.universe.size,
    criteria: stats.universe.criteria,
    generatedAt: stats.generatedAt,
    sectorCount: Object.keys(stats.sectors).length,
  };
}

/**
 * Convert a z-score to a 0-100 score. Linear mapping with z=0 → 50,
 * z=±3 → 0/100, clipped at the extremes.
 */
function zToScore(z: number): number {
  const s = 50 + z * (50 / 3);
  return Math.max(0, Math.min(100, s));
}

/**
 * Score a metric where higher raw values are better (e.g., ROE, growth, returns).
 */
export function scoreHigher(value: number | null | undefined, stats: MetricStats | null): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (!stats || stats.std <= 0) return null;
  const z = (value - stats.mean) / stats.std;
  return zToScore(z);
}

/**
 * Score a metric where lower raw values are better (e.g., P/E, volatility).
 * Negative values for ratio metrics (negative earnings) get a fixed low score.
 */
export function scoreLower(
  value: number | null | undefined,
  stats: MetricStats | null,
  opts: { negativeIsBad?: boolean; negativeScore?: number } = {}
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (opts.negativeIsBad && value < 0) {
    return opts.negativeScore ?? 10;
  }
  if (!stats || stats.std <= 0) return null;
  const z = (value - stats.mean) / stats.std;
  return zToScore(-z);
}

/**
 * Beta is special — the "ideal" raw value is ~1.0 (moves with the market).
 * Score based on distance from 1 via a fixed piecewise table rather than
 * z-scoring against the universe. Beta is a market-neutral construct: "good"
 * is anchored to 1.0 by definition, not by the universe's recent average. A
 * z-score against universe-wide beta would make scores drift as the market
 * regime changes, which is misleading here. The universe-stats `beta` row
 * is still computed by the nightly job but intentionally unused.
 */
export function scoreBeta(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  // Distance from 1, then score lower-is-better.
  // |β-1|=0 → 90, |β-1|=1 → 35, |β-1|=2 → 10.
  const dist = Math.abs(value - 1);
  if (dist <= 0.1) return 90;
  if (dist <= 0.3) return 75;
  if (dist <= 0.6) return 55;
  if (dist <= 1.0) return 35;
  if (dist <= 1.5) return 20;
  return 10;
}

/**
 * RSI is non-monotonic — too low is oversold (mild positive), middle is neutral,
 * upper-mid is healthy momentum, extreme-high is overbought (negative).
 * Keep this as a fixed piecewise curve; z-score doesn't apply cleanly.
 */
export function scoreRsi(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value < 30) return 60;
  if (value <= 50) return 60 - ((value - 30) / 20) * 10; // 60→50
  if (value <= 70) return 50 + ((value - 50) / 20) * 38; // 50→88
  if (value <= 80) return 88 - ((value - 70) / 10) * 18; // 88→70
  return Math.max(20, 70 - ((value - 80) / 20) * 50); // 70→20
}

/**
 * MA crossover is binary (50d > 200d = bullish trend = golden cross).
 */
export function scoreMaCross(above: boolean | null): number | null {
  if (above === null) return null;
  return above ? 75 : 30;
}
