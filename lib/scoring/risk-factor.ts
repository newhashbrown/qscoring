/**
 * Risk factor — v2 (EWMA volatility + beta sub-score variants).
 *
 * SCAFFOLD / CONTRACT — owned and implemented by Phase-2 Agent B.
 * Wired into score.ts behind RISK_EWMA_VOL and RISK_BETA_VARIANT (defaults
 * keep current behavior: equal-weight 60d realized vol + scoreBeta). Stubs
 * return null until Agent B implements, so with flags at default nothing here
 * executes.
 *
 * (1) EWMA volatility — exponentially-weighted, to kill the equal-weight
 *     rolling-window "plateau" artifact (a vol level sticks until an old large
 *     move drops out of the window). Point-in-time (prices ≤ as-of only).
 * (2) Beta sub-score variants:
 *     - low_abs : reward low |beta| (defensive tilt) — lower |beta| → higher score
 *     - neutral : reward beta near a target (≈1.0 market-neutral by default)
 *     Both are pure functions of a beta value; the production wiring chooses
 *     one via RISK_BETA_VARIANT.
 */
import type { PricePoint } from "./fmp";

// 252 trading days/year — same annualization factor as momentum.realizedVolatility,
// so EWMA and equal-weight vols live on the same (annualized) scale.
const TRADING_DAYS_PER_YEAR = 252;

// Minimum log returns required before EWMA is meaningful. At λ=0.94 the
// effective memory is ~1/(1-λ) ≈ 16 days; fewer than this and the estimate is
// dominated by one or two moves. We require enough closes to form this many
// returns (so MIN_RETURNS + 1 price points). Mirrors the spirit of the
// `length <= days` guard in realizedVolatility, but expressed in returns.
const MIN_RETURNS = 20;

/**
 * Sort price history newest-first (index 0 = most recent), matching the
 * convention in momentum.ts. Defensive copy so callers' arrays are untouched
 * (immutability) and the result is independent of input ordering — which is
 * what makes ewmaVolatility point-in-time / order-invariant.
 */
function newestFirst(history: PricePoint[]): PricePoint[] {
  return [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * EWMA annualized realized volatility over recent log returns, RiskMetrics
 * convention. Point-in-time: reads ONLY the passed history (prices ≤ as-of),
 * so appending newer rows and re-slicing to the same as-of date yields the
 * identical number.
 *
 * Formula (newest-first, k = 0 is the most recent return r_0):
 *   var_t = (1 - λ) · Σ_{k≥0} λ^k · r_{t-k}²
 *   vol   = sqrt(var_t) · sqrt(252)
 *
 * Notes on the deliberate choices here:
 *  - NO mean-centering. RiskMetrics assumes a zero daily mean, so we sum raw
 *    squared returns — this is intentionally different from
 *    realizedVolatility, which subtracts the sample mean and divides by (n-1).
 *  - NO weight renormalization. We use the literal (1-λ) coefficient rather
 *    than dividing by the realized weight sum (1-λ^N). At N≈60 the under-count
 *    is ~2.5% — negligible — and it keeps the estimator a true exponential
 *    filter (the standard RiskMetrics recursion var_t = λ·var_{t-1}
 *    + (1-λ)·r_t² is exactly this with infinite history).
 *  - Uses the FULL passed window, letting λ^k attenuate old returns rather than
 *    imposing a hard cutoff. This is what removes the equal-weight "plateau"
 *    artifact: in a fixed 60d window a single large old move holds vol elevated
 *    until it drops out; here its weight decays smoothly every day.
 *
 * `lambda` is the daily decay (0 < λ < 1; ~0.94 is the RiskMetrics daily value).
 * Returns null when there are too few returns (< MIN_RETURNS).
 */
export function ewmaVolatility(history: PricePoint[], lambda = 0.94): number | null {
  if (!Number.isFinite(lambda) || lambda <= 0 || lambda >= 1) return null;
  const sorted = newestFirst(history);
  if (sorted.length < MIN_RETURNS + 1) return null;

  // Log returns, newest-first: r[0] = log(P_today / P_yesterday).
  const returns: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const today = sorted[i].price;
    const prev = sorted[i + 1].price;
    if (!today || !prev) return null; // zero/missing price → drop the metric
    returns.push(Math.log(today / prev));
  }
  if (returns.length < MIN_RETURNS) return null;

  // var = (1-λ) · Σ λ^k · r_k²  (k = 0 is newest → highest weight).
  let weightedSumSq = 0;
  let weight = 1; // λ^0
  for (let k = 0; k < returns.length; k++) {
    weightedSumSq += weight * returns[k] * returns[k];
    weight *= lambda;
  }
  const variance = (1 - lambda) * weightedSumSq;
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Beta variants below are pure functions of a single beta value (the FMP
// 5-year beta). Production picks one via RISK_BETA_VARIANT. Both clamp to
// [0,100] and return null on null/undefined/NaN, matching scoreBeta in zscore.ts.

// scoreBetaLowAbs: half-life style decay. |β|=0 → SCORE_AT_ZERO; the score is
// halved every BETA_HALF_LIFE units of |β|. Smooth, strictly decreasing in |β|
// over the unsaturated range — no piecewise table needed.
const LOW_ABS_SCORE_AT_ZERO = 100;
const LOW_ABS_HALF_LIFE = 0.8; // |β| at which the score halves

// scoreBetaNeutral: triangular falloff around the target. Peak NEUTRAL_PEAK at
// β==target, dropping by NEUTRAL_SLOPE points per unit of |β-target|, clamped.
const NEUTRAL_PEAK = 100;
const NEUTRAL_SLOPE = 55; // points lost per unit distance from target

/**
 * Beta variant: reward LOW |beta| (defensive tilt). Monotonically decreasing in
 * |beta| — lower |beta| → higher score — via exponential half-life decay so it
 * never goes negative and degrades gracefully for very high beta. Clamped [0,100].
 */
export function scoreBetaLowAbs(beta: number | null | undefined): number | null {
  if (beta == null || !Number.isFinite(beta)) return null;
  const score = LOW_ABS_SCORE_AT_ZERO * Math.pow(0.5, Math.abs(beta) / LOW_ABS_HALF_LIFE);
  return Math.max(0, Math.min(100, score));
}

/**
 * Beta variant: reward beta NEAR `target` (market-neutral). Max score at
 * beta==target, decreasing symmetrically with |beta-target|. Clamped [0,100].
 */
export function scoreBetaNeutral(
  beta: number | null | undefined,
  target = 1.0
): number | null {
  if (beta == null || !Number.isFinite(beta)) return null;
  const score = NEUTRAL_PEAK - NEUTRAL_SLOPE * Math.abs(beta - target);
  return Math.max(0, Math.min(100, score));
}
