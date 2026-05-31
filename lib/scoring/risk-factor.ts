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

/**
 * EWMA annualized realized volatility over recent log returns. `lambda` is the
 * decay (RiskMetrics convention ~0.94 daily). AGENT B: implement, point-in-time.
 * Returns null when history is too short.
 */
export function ewmaVolatility(_history: PricePoint[], _lambda = 0.94): number | null {
  return null; // TODO(Agent B)
}

/** Beta variant: lower |beta| scores higher (defensive). AGENT B: implement. */
export function scoreBetaLowAbs(_beta: number | null | undefined): number | null {
  return null; // TODO(Agent B)
}

/** Beta variant: score by proximity to `target` (market-neutral). AGENT B: implement. */
export function scoreBetaNeutral(
  _beta: number | null | undefined,
  _target = 1.0
): number | null {
  return null; // TODO(Agent B)
}
