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
 * Update notes for v0.3:
 *   - Universe expanded from $15B large-cap to $2B mid+large-cap (May 2026)
 *   - Signal logic now rounds before threshold comparison so displayed
 *     factor scores match the integer thresholds in deriveSignal
 *   - Daily snapshot filenames use US market close date, not UTC date
 */
export const QSCORE_MODEL_VERSION = "v0.3";
