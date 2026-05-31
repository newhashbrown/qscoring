/**
 * Single source of truth for site-wide feature toggles.
 *
 * Each flag is a boolean constant. To roll a feature back, set its flag
 * to false, commit, push — Cloudflare Workers Builds redeploys in
 * 1-2 minutes and the feature disappears with no other code changes.
 *
 * For features that need richer config (multivariate, per-cohort, %
 * rollout), this module is the wrong tool — use a real flag service.
 * Right now everything we ship is binary: on or off.
 */

/**
 * Market context strip below the nav — shows S&P 500 / Nasdaq Composite /
 * Russell 2000 / VIX index quotes plus the QScore Universe Average.
 *
 * Set to false to hide site-wide. The MarketStrip component returns null
 * when the flag is off so removal is invisible to the rest of the layout.
 *
 * Re-enabled now that fmpGet has stale-while-error fallback via D1
 * (lib/scoring/fmp-cache.ts) — an FMP rate-limit no longer blanks the
 * page; the strip serves the last cached quotes instead.
 */
export const MARKET_STRIP_ENABLED = true;

/**
 * Stripe-backed Pro tier (Checkout, Customer Portal, webhook handler).
 *
 * Set to false to hide the /pricing page, remove the "Upgrade to Pro"
 * nav link, and stop offering subscriptions. Active subscribers stay
 * subscribed; gating still respects their existing `users.tier = 'pro'`
 * status. Only the buy/upgrade flow disappears.
 *
 * Kill switch for: Stripe outages, needing to pause new sales
 * temporarily, or rolling back the upgrade UI without rolling back any
 * other code.
 */
export const STRIPE_BILLING_ENABLED = true;

// ─── Phase-2 factor experiments (offline A/B via research/ harness) ───
// All default to current production behavior. Do NOT flip the defaults until
// the backtest harness shows an IC improvement and the change is reviewed.

/**
 * Momentum v2: replace the legacy momentum sub-components (12/3/1-mo return,
 * RSI(14), 50/200 MA crossover) with the volatility-scaled 12-1 momentum factor
 * (lib/scoring/momentum-factor.ts). OFF = legacy momentum unchanged.
 */
export const MOMENTUM_V2_ENABLED = false;

/**
 * Risk: use EWMA volatility (lib/scoring/risk-factor.ts) instead of the
 * equal-weight 60-day realized vol. OFF = equal-weight realized vol unchanged.
 */
export const RISK_EWMA_VOL_ENABLED = false;

/**
 * Risk: beta sub-score variant.
 *   "default"  — current scoreBeta (distance-from-1.0 piecewise)
 *   "low_abs"  — reward low |beta| (defensive)
 *   "neutral"  — reward beta near target (market-neutral)
 */
export type BetaVariant = "default" | "low_abs" | "neutral";
export const RISK_BETA_VARIANT: BetaVariant = "default";
