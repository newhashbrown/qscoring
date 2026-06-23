import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { rank, pearson, spearman } from "./rank-correlation";

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ─── rank ────────────────────────────────────────────────────
test("rank: strictly increasing values get 1..n", () => {
  const r = rank([10, 20, 30, 40]);
  strictEqual(r[0], 1);
  strictEqual(r[1], 2);
  strictEqual(r[2], 3);
  strictEqual(r[3], 4);
});

test("rank: ties receive the average (mid) rank", () => {
  // [50,50,50,60] occupy positions 1,2,3 → mid-rank 2; 60 → rank 4
  const r = rank([50, 50, 50, 60]);
  strictEqual(r[0], 2);
  strictEqual(r[1], 2);
  strictEqual(r[2], 2);
  strictEqual(r[3], 4);
});

// ─── pearson ─────────────────────────────────────────────────
test("pearson: identical series → 1", () => {
  strictEqual(approx(pearson([1, 2, 3], [1, 2, 3]), 1), true);
});

test("pearson: zero variance → NaN", () => {
  strictEqual(Number.isNaN(pearson([5, 5, 5], [1, 2, 3])), true);
});

// ─── spearman ────────────────────────────────────────────────
test("spearman: perfect monotonic increasing → 1", () => {
  strictEqual(approx(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1), true);
});

test("spearman: perfect monotonic decreasing → -1", () => {
  strictEqual(approx(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1), true);
});

test("spearman: ties use mid-rank Pearson, NOT the 1-6Σd²/n(n²-1) shortcut", () => {
  // x=[50,50,50,60] mid-ranks=[2,2,2,4]; y ranks=[1,2,3,4]
  // correct (Pearson on ranks) = 3/sqrt(15) ≈ 0.7745966692
  // d² shortcut would (wrongly) give 0.8 — this guards against it.
  const r = spearman([50, 50, 50, 60], [1, 2, 3, 4]);
  strictEqual(approx(r, 0.7745966692), true);
});

test("spearman: skips null / non-finite pairs", () => {
  strictEqual(approx(spearman([1, 2, 3, null], [10, 20, 30, 99]), 1), true);
});

test("spearman: fewer than 2 finite pairs → NaN", () => {
  strictEqual(Number.isNaN(spearman([1, null], [null, 2])), true);
});
