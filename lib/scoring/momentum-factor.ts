/**
 * Momentum factor — v2 (volatility-scaled 12-1 price momentum).
 *
 * SCAFFOLD / CONTRACT — owned and implemented by Phase-2 Agent A.
 * Wired into score.ts behind the MOMENTUM_V2 flag (default OFF → legacy
 * RSI(14) + 50/200 MA-crossover momentum is unchanged). Until Agent A fills
 * these in, the functions return null, so with the flag off nothing executes
 * and behavior is identical to today.
 *
 * Definition to implement (academic 12-1 momentum, Jegadeesh–Titman / Carhart):
 *   raw = (return over t-12mo … t-1mo, i.e. SKIP the most recent ~21 days)
 *         ÷ realized volatility over the same window
 * Skipping the most recent month removes the well-documented short-term
 * reversal contamination; dividing by vol is the "risk-adjusted/residual"
 * momentum form. Keep it point-in-time (uses only prices ≤ as-of) so the
 * look-ahead truncation check (scripts/research/lookahead-check.ts) stays green.
 */
import type { PricePoint } from "./fmp";

/**
 * Raw volatility-scaled 12-1 momentum signal (higher = stronger momentum).
 * Used by the research harness to report this sub-component's IC. Returns null
 * when history is too short. AGENT A: implement.
 */
export function volScaledMomentum12_1(_history: PricePoint[]): number | null {
  return null; // TODO(Agent A): 12-1 return skipping last ~21d, ÷ realized vol
}

/**
 * 0–100 momentum score used by the production momentum category when
 * MOMENTUM_V2 is on. AGENT A: implement (decide the raw→score mapping and keep
 * it sector-relative, consistent with the rest of the model). Must stay
 * point-in-time. Returns null when not computable so aggregate() skips it.
 */
export function scoreVolScaledMomentum(
  _history: PricePoint[],
  _sector: string | null
): number | null {
  return null; // TODO(Agent A)
}
