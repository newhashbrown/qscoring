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

// Window boundaries in trading days, matching the conventions in momentum.ts.
// SKIP_DAYS is the most-recent ~1 month we deliberately ignore (short-term
// reversal); LOOKBACK_DAYS is the ~12-month anchor. Both the return and the
// volatility are measured over the SAME span [SKIP_DAYS … LOOKBACK_DAYS], so
// nothing inside the skipped recent month can move the signal — that is what
// keeps the factor point-in-time under most-recent-day truncation.
const SKIP_DAYS = 21; // ~1 trading month
const LOOKBACK_DAYS = 252; // ~12 trading months
const ANNUALIZATION = 252; // trading days per year, matching realizedVolatility()

// Minimum usable history: we need index LOOKBACK_DAYS to exist, so length must
// be at least LOOKBACK_DAYS + 1 = 253.
const MIN_POINTS = LOOKBACK_DAYS + 1;

// tanh squashing scale for the raw→score mapping. The raw signal is a
// (12-1 return ÷ annualized vol) ratio; for a typical equity a full-year 12-1
// return of ~20–40% against ~25% annualized vol lands the ratio around ~1, so
// k ≈ 1.5 spreads the bulk of names across the 0–100 range without saturating.
// This is a deliberately rough, distribution-free choice — see TODO below.
const SCORE_TANH_SCALE = 1.5;

/**
 * Sort newest-first (index 0 = most recent). Mirrors momentum.ts's private
 * newestFirst() — that helper isn't exported, so we inline the same defensive
 * sort here rather than depend on FMP's ordering.
 */
function newestFirst(history: PricePoint[]): PricePoint[] {
  return [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Raw volatility-scaled 12-1 momentum signal (higher = stronger momentum).
 * Used by the research harness to report this sub-component's IC. Returns null
 * when history is too short.
 *
 * Formula (newest-first sorted history):
 *   numerator   = price[SKIP_DAYS] / price[LOOKBACK_DAYS] - 1   // 12-1 return
 *   denominator = annualized stdev of daily log returns over the SAME window,
 *                 i.e. log(price[i] / price[i+1]) for i = SKIP_DAYS … LOOKBACK_DAYS-1
 *   raw         = numerator / denominator
 *
 * Both legs ignore indices 0 … SKIP_DAYS-1 (the most recent ~month), so
 * truncating the most-recent N days of input (N ≤ SKIP_DAYS) does not change
 * the value computed at an older as-of date.
 */
export function volScaledMomentum12_1(history: PricePoint[]): number | null {
  const sorted = newestFirst(history);
  if (sorted.length < MIN_POINTS) return null;

  const recent = sorted[SKIP_DAYS]?.price; // price ~1 month ago
  const past = sorted[LOOKBACK_DAYS]?.price; // price ~12 months ago
  if (recent == null || past == null) return null;
  // A literal 0 is almost always an FMP data-quality artifact (delisted /
  // halted row). Match momentum.ts: drop the metric rather than emit garbage.
  if (recent === 0 || past === 0) return null;

  const numerator = recent / past - 1;

  // Realized volatility over the SAME [SKIP_DAYS … LOOKBACK_DAYS] window. We do
  // NOT reuse realizedVolatility() from momentum.ts because it measures the
  // most-recent N days (window starting at index 0), which would let the
  // skipped recent month leak back into the denominator and break point-in-time
  // invariance. Inline keeps the window aligned with the numerator.
  const logReturns: number[] = [];
  for (let i = SKIP_DAYS; i < LOOKBACK_DAYS; i++) {
    const today = sorted[i]?.price;
    const prev = sorted[i + 1]?.price;
    if (today == null || prev == null || today <= 0 || prev <= 0) return null;
    logReturns.push(Math.log(today / prev));
  }

  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(ANNUALIZATION);

  // Zero / non-finite vol (e.g. a perfectly flat window) would make the ratio
  // ±Infinity or NaN — not a meaningful signal, so drop the metric.
  if (!Number.isFinite(vol) || vol === 0) return null;

  const raw = numerator / vol;
  return Number.isFinite(raw) ? raw : null;
}

/**
 * 0–100 momentum score used by the production momentum category when
 * MOMENTUM_V2 is on. Maps the raw vol-scaled signal through a tanh squash
 * centered at 0 (raw 0 → 50), monotonic and bounded to [0, 100]. Stays
 * point-in-time because it only consumes volScaledMomentum12_1(history).
 * Returns null when not computable so aggregate() skips it.
 *
 * TODO(production): this is a distribution-free placeholder. Real scoring
 * should z-score the raw signal against a sector distribution — add a
 * `volScaledMomentum12_1` key (mean/std per sector) to build-universe-stats.ts
 * and map via the shared z-score→percentile path the other factors use, so the
 * score is sector-relative instead of an absolute tanh. `sector` is threaded
 * through now so that swap is a no-op at the call site.
 */
export function scoreVolScaledMomentum(
  history: PricePoint[],
  _sector: string | null
): number | null {
  const raw = volScaledMomentum12_1(history);
  if (raw == null) return null;

  const score = 50 * (1 + Math.tanh(raw / SCORE_TANH_SCALE));
  // Defensive clamp; tanh already bounds to (-1, 1) → score to (0, 100).
  return Math.max(0, Math.min(100, score));
}
