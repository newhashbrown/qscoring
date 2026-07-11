/**
 * Metric applicability by industry group (model v0.4).
 *
 * Some composite + quality-panel metrics are not meaningful for certain
 * industries — EV/EBITDA, FCF yield/growth, Altman-Z, net-debt/EBITDA, and
 * interest coverage are enterprise/industrial constructs that misfire on banks
 * (deposit-funded, book-value-driven). A metric marked NOT APPLICABLE for a
 * group is treated EXACTLY like missing data: dropped from the category average
 * AND from the completeness denominator (so the company isn't penalized on
 * confidence), and rendered as "n/m" instead of a score.
 *
 * Declarative + keyed by industry group so new groups (insurers, REITs) are a
 * data edit, not a code change. Banks populated now; insurer/REIT stubbed.
 */

export type IndustryGroup = "banks" | "insurance" | "reits";

/** Composite-metric NAMES (must match `name` in score.ts) not meaningful per group. */
const NOT_APPLICABLE_COMPOSITE: Record<IndustryGroup, readonly string[]> = {
  // Banks: enterprise-value + free-cash-flow metrics don't apply to a
  // deposit-funded balance sheet ("Banks - Diversified", "Banks - Regional").
  banks: ["EV/EBITDA", "FCF Yield", "FCF Growth"],
  insurance: [], // TODO: populate when the insurer model lands
  reits: [], // TODO: populate when the REIT model lands (FFO-based)
};

/** Quality-panel metric KEYS (lib/scoring/quality.ts) not meaningful per group. */
const NOT_APPLICABLE_QUALITY: Record<IndustryGroup, readonly string[]> = {
  banks: ["altmanZ", "netDebtToEbitda", "interestCoverage"],
  insurance: [],
  reits: [],
};

/** Resolve a company's industry group from its FMP sector/industry, or null. */
export function industryGroup(
  sector?: string | null,
  industry?: string | null
): IndustryGroup | null {
  const ind = (industry ?? "").toLowerCase();
  const sec = (sector ?? "").toLowerCase();
  // Match on INDUSTRY (not the broad "Financial Services" sector, which also
  // holds payment/exchange names the generic model handles fine).
  if (/\bbank/.test(ind)) return "banks";
  if (/insurance/.test(ind)) return "insurance";
  if (/reit/.test(ind) || sec === "real estate") return "reits";
  return null;
}

/** Composite metric names that are not applicable for this company (empty set = all apply). */
export function notApplicableMetrics(sector?: string | null, industry?: string | null): Set<string> {
  const g = industryGroup(sector, industry);
  return new Set(g ? NOT_APPLICABLE_COMPOSITE[g] : []);
}

/** Quality-panel metric keys that are not applicable for this company. */
export function notApplicableQuality(sector?: string | null, industry?: string | null): Set<string> {
  const g = industryGroup(sector, industry);
  return new Set(g ? NOT_APPLICABLE_QUALITY[g] : []);
}

/** Short label rendered in place of a not-meaningful metric's score/value. */
export const NOT_MEANINGFUL_LABEL = "n/m";
