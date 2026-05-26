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
