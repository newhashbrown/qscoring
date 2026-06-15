import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import {
  computeQuantiles,
  percentileRank,
  rangePosition,
  QUANTILE_LEVELS,
} from "./percentile";

// ─── computeQuantiles ────────────────────────────────────────
test("computeQuantiles: returns one breakpoint per level, monotonic", () => {
  const vals = Array.from({ length: 101 }, (_, i) => i); // 0..100
  const q = computeQuantiles(vals)!;
  strictEqual(q.length, QUANTILE_LEVELS.length);
  // p50 of 0..100 is 50
  const mid = q[QUANTILE_LEVELS.indexOf(0.5)];
  strictEqual(Math.abs(mid - 50) < 1, true);
  // monotonic non-decreasing
  strictEqual(q.every((v, i) => i === 0 || v >= q[i - 1]), true);
});

test("computeQuantiles: drops non-finite, null below min sample", () => {
  strictEqual(computeQuantiles([1, 2, NaN, 3]), null); // 3 finite < 5
  strictEqual(computeQuantiles([1, 2, 3, 4, 5]) !== null, true);
});

// ─── percentileRank ──────────────────────────────────────────
// Skewed breakpoints: most mass low, a long right tail (like P/E).
const skewed = computeQuantiles([
  5, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 25, 40, 80, 300,
])!;

test("percentileRank: a median-ish value ranks near the median, not via Gaussian", () => {
  // The true median of the sample is ~14; ranking 14 should land ~50.
  const p = percentileRank(14, skewed)!;
  strictEqual(p >= 40 && p <= 60, true);
});

test("percentileRank: a high value lands high; a low value lands low", () => {
  strictEqual(percentileRank(250, skewed)! >= 90, true);
  strictEqual(percentileRank(5, skewed)!, Math.round(QUANTILE_LEVELS[0] * 100)); // at/below p5
});

test("percentileRank: linear interpolation between breakpoints", () => {
  // Evenly spaced 0..100 → value 30 ≈ 30th percentile.
  const even = computeQuantiles(Array.from({ length: 101 }, (_, i) => i))!;
  const p = percentileRank(30, even)!;
  strictEqual(Math.abs(p - 30) <= 5, true);
});

test("percentileRank: null/degenerate inputs → null", () => {
  strictEqual(percentileRank(null, skewed), null);
  strictEqual(percentileRank(10, null), null);
  strictEqual(percentileRank(10, [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), null); // all-equal
  strictEqual(percentileRank(10, [1, 2, 3]), null); // wrong length
});

// ─── rangePosition (own trailing history) ────────────────────
test("rangePosition: at max → high, at min → low, middle → mid", () => {
  const s = [40, 50, 55, 60, 70];
  strictEqual(rangePosition(70, s).band, "high");
  strictEqual(rangePosition(40, s).band, "low");
  strictEqual(rangePosition(55, s).band, "mid");
});

test("rangePosition: rank is the position within [min,max]", () => {
  const r = rangePosition(60, [40, 50, 60]); // (60-40)/(60-40)=100
  strictEqual(r.rank, 100);
  strictEqual(r.band, "high");
});

test("rangePosition: too few points or non-finite → null", () => {
  strictEqual(rangePosition(50, [50, 50]).rank, null); // <3
  strictEqual(rangePosition(NaN, [1, 2, 3]).band, null);
});
