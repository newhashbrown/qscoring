/**
 * Percentile utilities for the relative-context tier (Phase 4).
 *
 * universe-stats.json stores, per metric, the metric's VALUE at a fixed set of
 * percentile LEVELS (the breakpoints below). A ticker's percentile rank is then
 * recovered by locating its raw value among those breakpoints and interpolating
 * linearly — a piecewise-linear empirical CDF. This is deliberately NOT a
 * normal-CDF(z) estimate: financial ratios are heavily right-skewed (P/E mean
 * 25, std 113), so a Gaussian assumption mislabels a median P/E as the 50th
 * percentile when it's really ~60th+. The ECDF reflects the real distribution.
 */

// Percentile levels at which build-universe-stats stores metric breakpoints.
// Denser in the tails so skewed ratios are captured where it matters.
export const QUANTILE_LEVELS = [
  0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95,
] as const;

const MIN_QUANTILE_SAMPLE = 5;

function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Compute the breakpoint VALUES at `levels` from raw metric values. Returns
 * null when there aren't enough samples to be meaningful. Non-finite values
 * are dropped first.
 */
export function computeQuantiles(
  values: readonly number[],
  levels: readonly number[] = QUANTILE_LEVELS
): number[] | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length < MIN_QUANTILE_SAMPLE) return null;
  return levels.map((p) => quantileSorted(sorted, p));
}

/**
 * Estimate the percentile rank (0–100) of `value` against stored breakpoints.
 * Piecewise-linear interpolation between the surrounding levels; clamped to the
 * stored tail levels (values beyond p5/p95 report the boundary, not 0/100, so
 * we never overclaim precision past the data we kept). Returns null on bad
 * input (missing/empty/degenerate breakpoints) so callers can hide the figure.
 */
export function percentileRank(
  value: number | null | undefined,
  breakpoints: readonly number[] | null | undefined,
  levels: readonly number[] = QUANTILE_LEVELS
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (!breakpoints || breakpoints.length !== levels.length || breakpoints.length < 2) return null;

  // Breakpoints must be non-decreasing to interpolate; a degenerate (all-equal,
  // e.g. a binary metric) distribution can't yield a meaningful percentile.
  for (let i = 1; i < breakpoints.length; i++) {
    if (breakpoints[i] < breakpoints[i - 1]) return null;
  }
  if (breakpoints[0] === breakpoints[breakpoints.length - 1]) return null;

  if (value <= breakpoints[0]) return Math.round(levels[0] * 100);
  const last = breakpoints.length - 1;
  if (value >= breakpoints[last]) return Math.round(levels[last] * 100);

  for (let i = 1; i <= last; i++) {
    if (value <= breakpoints[i]) {
      const span = breakpoints[i] - breakpoints[i - 1];
      const frac = span > 0 ? (value - breakpoints[i - 1]) / span : 0;
      const level = levels[i - 1] + frac * (levels[i] - levels[i - 1]);
      return Math.round(level * 100);
    }
  }
  return Math.round(levels[last] * 100);
}

/**
 * Position of a value within its own trailing series, as a 0–100 rank plus a
 * coarse band. Used for the "vs own 30-day range" framing (the brief's
 * own-trailing-history axis) where a thin sample makes a precise percentile
 * overclaim — the band is the honest headline, the rank a secondary detail.
 */
export type RangePosition = {
  rank: number | null; // 0 = at/below series min, 100 = at/above series max
  band: "low" | "below-mid" | "mid" | "above-mid" | "high" | null;
};

export function rangePosition(
  value: number | null | undefined,
  series: readonly number[] | null | undefined
): RangePosition {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { rank: null, band: null };
  }
  const finite = (series ?? []).filter((v) => Number.isFinite(v));
  if (finite.length < 3) return { rank: null, band: null };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) return { rank: 50, band: "mid" };
  const rank = Math.round(((value - min) / (max - min)) * 100);
  const clamped = Math.max(0, Math.min(100, rank));
  const band =
    clamped <= 15 ? "low" : clamped <= 40 ? "below-mid" : clamped <= 60 ? "mid" : clamped <= 85 ? "above-mid" : "high";
  return { rank: clamped, band };
}
