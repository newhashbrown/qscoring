import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { maxDrawdown, downsideDeviation, returnsCorrelation } from "./risk-stats";
import type { PricePoint } from "./fmp";

const approx = (a: number | null, b: number, eps = 1e-6) => a !== null && Math.abs(a - b) < eps;

// Helper: build newest-first history (FMP order) from chronological prices.
function hist(pricesChrono: number[], startDate = "2026-01-01"): PricePoint[] {
  const base = new Date(`${startDate}T00:00:00Z`).getTime();
  return pricesChrono
    .map((price, i) => ({ symbol: "X", date: new Date(base + i * 86400000).toISOString().slice(0, 10), price, volume: 0 }))
    .reverse(); // newest first
}

// ─── maxDrawdown ─────────────────────────────────────────────
test("maxDrawdown: peak-to-trough decline as positive fraction", () => {
  // 100 → 120 (peak) → 90 (trough) → 110: max DD = (120-90)/120 = 0.25
  strictEqual(approx(maxDrawdown(hist([100, 120, 90, 110])), 0.25), true);
});

test("maxDrawdown: monotonic rise → 0; <2 bars → null", () => {
  strictEqual(maxDrawdown(hist([100, 110, 120])), 0);
  strictEqual(maxDrawdown(hist([100])), null);
});

// ─── downsideDeviation ───────────────────────────────────────
test("downsideDeviation: only down moves contribute; all-up → 0", () => {
  strictEqual(downsideDeviation(hist([100, 101, 102, 103])), 0);
  const d = downsideDeviation(hist([100, 90, 99, 95]));
  strictEqual(d !== null && d > 0, true);
});

// ─── returnsCorrelation ──────────────────────────────────────
test("returnsCorrelation: identical return series → ~+1", () => {
  const a = hist([100, 110, 121, 133.1, 146.41, 161.05, 177.16, 194.87, 214.36, 235.79, 259.37]);
  const r = returnsCorrelation(a, a);
  strictEqual(r !== null && r > 0.99, true);
});

test("returnsCorrelation: opposite moves → negative", () => {
  const up = hist([100, 110, 100, 110, 100, 110, 100, 110, 100, 110, 100]);
  const down = hist([100, 90, 100, 90, 100, 90, 100, 90, 100, 90, 100]);
  const r = returnsCorrelation(up, down);
  strictEqual(r !== null && r < 0, true);
});

test("returnsCorrelation: too few shared dates → null", () => {
  strictEqual(returnsCorrelation(hist([100, 110]), hist([100, 110])), null);
});
