import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { attachRelativeContext, metricRelative, MAPPED_METRIC_NAMES } from "./relative";
import type { CategoryScore } from "./types";

// The 20 metric names score.ts assigns; the map must cover them or relative
// context silently goes missing for that metric. Guards against drift.
const SCORE_TS_METRIC_NAMES = [
  "P/E", "P/B", "P/S", "EV/EBITDA",
  "Revenue Growth", "EPS Growth", "FCF Growth",
  "12-Month Return", "3-Month Return", "1-Month Return", "RSI (14)", "50/200 MA",
  "ROE", "ROA", "Gross Margin", "Operating Margin", "Net Margin", "FCF Yield",
  "Beta", "60-Day Volatility",
];

test("name→key map covers every score.ts metric name", () => {
  const missing = SCORE_TS_METRIC_NAMES.filter((n) => !MAPPED_METRIC_NAMES.includes(n));
  deepStrictEqual(missing, []);
});

test("metricRelative: returns the four-field shape with number|null values", () => {
  const r = metricRelative("pe", 20, "Technology", "lower");
  for (const k of ["sectorPercentile", "universePercentile", "sectorSize"] as const) {
    strictEqual(r[k] === null || typeof r[k] === "number", true);
  }
  // scoredAgainst comes from mean/std (present even before quantiles ship).
  strictEqual(["sector", "universe", null].includes(r.scoredAgainst), true);
});

test("metricRelative: 'none' direction emits no percentile (Beta/RSI/MA)", () => {
  const r = metricRelative("beta", 1.1, "Technology", "none");
  strictEqual(r.sectorPercentile, null);
  strictEqual(r.universePercentile, null);
});

test("attachRelativeContext: mapped metric gets relative, unmapped left alone", () => {
  const cats: CategoryScore[] = [
    {
      name: "value",
      label: "Value",
      score: 50,
      weightLong: 0.3,
      weightShort: 0.1,
      completeness: 1,
      metrics: [
        { name: "P/E", raw: 20, score: 60, weight: 1.2, format: "ratio" },
        { name: "Mystery Metric", raw: 1, score: 50, weight: 1 },
      ],
    },
  ];
  const out = attachRelativeContext(cats, "Technology");
  strictEqual(out[0].metrics[0].relative !== undefined, true);
  strictEqual(out[0].metrics[1].relative, undefined);
  // immutability: original untouched
  strictEqual(cats[0].metrics[0].relative, undefined);
});

test("attachRelativeContext: unknown sector still resolves (universe fallback or null)", () => {
  const cats: CategoryScore[] = [
    {
      name: "value", label: "Value", score: 50, weightLong: 0.3, weightShort: 0.1, completeness: 1,
      metrics: [{ name: "P/E", raw: 20, score: 60, weight: 1.2, format: "ratio" }],
    },
  ];
  const out = attachRelativeContext(cats, "Nonexistent Sector");
  const rel = out[0].metrics[0].relative!;
  strictEqual(["sector", "universe", null].includes(rel.scoredAgainst), true);
});
