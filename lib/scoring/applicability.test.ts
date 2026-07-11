import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { industryGroup, notApplicableMetrics, notApplicableQuality } from "./applicability";
import { aggregate } from "./score";
import type { MetricScore } from "./types";

// ─── industry group resolution ───────────────────────────────────────────────
test("industryGroup: matches banks on industry, not the broad sector", () => {
  strictEqual(industryGroup("Financial Services", "Banks - Diversified"), "banks");
  strictEqual(industryGroup("Financial Services", "Banks - Regional"), "banks");
  // Payment/exchange names in Financial Services are NOT banks — generic model applies.
  strictEqual(industryGroup("Financial Services", "Financial - Credit Services"), null);
  strictEqual(industryGroup("Technology", "Consumer Electronics"), null);
});

test("industryGroup: insurers and REITs resolve (for the stubbed maps)", () => {
  strictEqual(industryGroup("Financial Services", "Insurance - Property & Casualty"), "insurance");
  strictEqual(industryGroup("Real Estate", "REIT - Retail"), "reits");
  strictEqual(industryGroup("Real Estate", ""), "reits");
});

test("notApplicableMetrics: banks drop EV/EBITDA + FCF; non-banks drop nothing", () => {
  deepStrictEqual(
    notApplicableMetrics("Financial Services", "Banks - Diversified"),
    new Set(["EV/EBITDA", "FCF Yield", "FCF Growth"])
  );
  strictEqual(notApplicableMetrics("Technology", "Software").size, 0);
  // Insurers/REITs are stubbed empty in v0.4.
  strictEqual(notApplicableMetrics("Financial Services", "Insurance - Life").size, 0);
});

test("notApplicableQuality: banks drop the three balance-sheet quality metrics", () => {
  deepStrictEqual(
    notApplicableQuality("Financial Services", "Banks - Regional"),
    new Set(["altmanZ", "netDebtToEbitda", "interestCoverage"])
  );
  strictEqual(notApplicableQuality("Healthcare", "Drug Manufacturers").size, 0);
});

// ─── the core completeness fix: n/m metrics drop from BOTH average + weight ───
const m = (name: string, score: number | null, weight: number, applicable?: boolean): MetricScore => ({
  name,
  raw: null,
  score,
  weight,
  ...(applicable === false ? { applicable: false } : {}),
});

test("aggregate: an n/m metric is excluded from the average AND completeness (no penalty)", () => {
  // A bank's Value category: P/E, P/B, P/S all score; EV/EBITDA is n/m.
  const withNm = aggregate([
    m("P/E", 60, 1.2),
    m("P/B", 40, 1),
    m("P/S", 50, 1),
    m("EV/EBITDA", null, 1.2, false), // not applicable
  ]);
  // Same three applicable metrics, no n/m metric at all → must be IDENTICAL.
  const baseline = aggregate([m("P/E", 60, 1.2), m("P/B", 40, 1), m("P/S", 50, 1)]);
  deepStrictEqual(withNm, baseline);
  strictEqual(withNm.completeness, 1); // NOT penalized by the excluded metric
});

test("aggregate: a MISSING (null-score, still-applicable) metric DOES lower completeness", () => {
  const withMissing = aggregate([
    m("P/E", 60, 1.2),
    m("P/B", 40, 1),
    m("P/S", 50, 1),
    m("EV/EBITDA", null, 1.2), // applicable but no data → counts against completeness
  ]);
  strictEqual(withMissing.completeness < 1, true); // missing ≠ not-applicable
});

test("aggregate: all-n/m category falls back to neutral (50, completeness 0)", () => {
  const allNm = aggregate([m("A", null, 1, false), m("B", null, 1, false)]);
  strictEqual(allNm.score, 50);
  strictEqual(allNm.completeness, 0);
});
