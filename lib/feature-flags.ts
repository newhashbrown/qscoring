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
 */
export const MARKET_STRIP_ENABLED = true;
