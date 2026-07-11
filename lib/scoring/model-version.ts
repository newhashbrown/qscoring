/**
 * The current QScore model version. Bumped whenever the scoring math, factor
 * weights, signal thresholds, or universe definition changes — so any reader
 * of a /score page can tell which model produced the number, and any
 * historical snapshot in data/snapshots/ can be unambiguously paired with
 * the model that generated it.
 *
 * Versioning policy:
 *   v0.x — pre-validation. Model can change at any time; backtest pledge
 *          on /methodology#validation governs what publishes for billing.
 *   v1.x — first stable release after the validation section is filled in.
 *          Subsequent v1.x bumps require a documented changelog.
 *
 * Update notes for v0.4 (see MODEL_CHANGELOG.md):
 *   - Industry-based metric applicability. For banks, COMPOSITE metrics not
 *     meaningful for the industry (EV/EBITDA, FCF yield, FCF growth) are marked
 *     "n/m" and excluded from the category average AND the completeness
 *     denominator (so confidence isn't penalized), rather than scored. The
 *     quality-panel metrics (Altman-Z, net-debt/EBITDA, interest coverage) are a
 *     display-only Tier-3 panel — not part of the composite/confidence math — so
 *     for banks they simply render "n/m" instead of a value.
 *
 * Update notes for v0.3:
 *   - Universe expanded from $15B large-cap to $2B mid+large-cap (May 2026)
 *   - Signal logic now rounds before threshold comparison so displayed
 *     factor scores match the integer thresholds in deriveSignal
 *   - Daily snapshot filenames use US market close date, not UTC date
 */
export const QSCORE_MODEL_VERSION = "v0.4";
