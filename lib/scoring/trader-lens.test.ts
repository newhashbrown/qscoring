import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import {
  pctFrom,
  trailingReturn,
  volumeTrend,
  buildTraderLens,
} from "./trader-lens";
import type { PricePoint } from "./fmp";

function bar(price: number, volume: number): PricePoint {
  return { symbol: "TEST", date: "2026-01-01", price, volume };
}

function approx(actual: number | null, expected: number, eps = 1e-9): boolean {
  return actual !== null && Math.abs(actual - expected) < eps;
}

// ─── pctFrom ─────────────────────────────────────────────────
test("pctFrom: signed fraction above and below the reference", () => {
  strictEqual(approx(pctFrom(110, 100), 0.1), true);
  strictEqual(approx(pctFrom(90, 100), -0.1), true);
  strictEqual(pctFrom(100, 100), 0);
});

test("pctFrom: null / non-finite / non-positive reference → null", () => {
  strictEqual(pctFrom(100, 0), null);
  strictEqual(pctFrom(100, -5), null);
  strictEqual(pctFrom(NaN, 100), null);
  strictEqual(pctFrom(100, null), null);
  strictEqual(pctFrom(undefined, 100), null);
});

// ─── trailingReturn ──────────────────────────────────────────
test("trailingReturn: return from index `days` to the current (index 0) close", () => {
  // 21 bars, most-recent-first: h[0]=120, h[20]=100 → +20%
  const hist: PricePoint[] = [];
  for (let i = 0; i < 21; i++) hist.push(bar(120 - i, 100));
  // h[0]=120, h[20]=100
  strictEqual(approx(trailingReturn(hist, 20), 0.2), true);
});

test("trailingReturn: needs strictly more than `days` bars", () => {
  const hist: PricePoint[] = [];
  for (let i = 0; i < 20; i++) hist.push(bar(100, 100)); // exactly 20 → null for days=20
  strictEqual(trailingReturn(hist, 20), null);
  strictEqual(trailingReturn([], 20), null);
  strictEqual(trailingReturn(null, 20), null);
});

// ─── volumeTrend ─────────────────────────────────────────────
test("volumeTrend: recent short-window vs longer-window average volume", () => {
  // 20 bars: first 5 vol=300, next 15 vol=100.
  // avg(5)=300, avg(20)=(5*300 + 15*100)/20 = 150 → ratio 2.0
  const hist: PricePoint[] = [];
  for (let i = 0; i < 20; i++) hist.push(bar(10, i < 5 ? 300 : 100));
  strictEqual(approx(volumeTrend(hist, 5, 20), 2.0), true);
});

test("volumeTrend: null when history can't fill either window", () => {
  strictEqual(volumeTrend([], 5, 20), null);
  strictEqual(volumeTrend(null, 5, 20), null);
});

// ─── buildTraderLens ─────────────────────────────────────────
test("buildTraderLens: assembles scalars and the full setup-tag set", () => {
  // price 110, 50dma 100 (+10%), 200dma 90 (+22%), 52w high 112 (-1.8%, near),
  // 52w low 70 (+57%, not near). History: 21 bars, price 110→100 over 20 bars
  // (+10% momentum), first 5 bars 300 vol vs 100 after (volTrend 2.0).
  const hist: PricePoint[] = [];
  for (let i = 0; i < 21; i++) hist.push(bar(110 - i * 0.5, i < 5 ? 300 : 100));
  // h[0]=110, h[20]=100

  const lens = buildTraderLens({
    price: 110,
    sma50: 100,
    sma200: 90,
    week52High: 112,
    week52Low: 70,
    history: hist,
  });

  strictEqual(approx(lens.pctFrom50dma, 0.1), true);
  strictEqual(approx(lens.pctFrom200dma!, (110 - 90) / 90), true);
  strictEqual(approx(lens.pctFrom52wHigh!, (110 - 112) / 112), true);
  strictEqual(approx(lens.pctFrom52wLow!, (110 - 70) / 70), true);
  strictEqual(approx(lens.return20d, 0.1), true);
  strictEqual(approx(lens.volumeTrend, 2.0), true);
  deepStrictEqual(lens.setups, [
    "above_50dma",
    "above_200dma",
    "uptrend",
    "near_52w_high",
    "rising_volume",
    "strong_momentum",
  ]);
});

test("buildTraderLens: below-trend tags when price sits under the moving averages", () => {
  const lens = buildTraderLens({
    price: 90,
    sma50: 100,
    sma200: 110, // 50dma < 200dma → downtrend
    week52High: 200,
    week52Low: 60, // 90 is +50% off the low → not near
    history: null,
  });
  deepStrictEqual(lens.setups, ["below_50dma", "below_200dma", "downtrend"]);
  strictEqual(lens.return20d, null); // no history
  strictEqual(lens.volumeTrend, null);
});

test("buildTraderLens: all-null inputs degrade to null scalars and no setups", () => {
  const lens = buildTraderLens({
    price: null,
    sma50: null,
    sma200: null,
    week52High: null,
    week52Low: null,
    history: [],
  });
  strictEqual(lens.pctFrom50dma, null);
  strictEqual(lens.pctFrom200dma, null);
  strictEqual(lens.pctFrom52wHigh, null);
  strictEqual(lens.pctFrom52wLow, null);
  strictEqual(lens.return20d, null);
  strictEqual(lens.volumeTrend, null);
  deepStrictEqual(lens.setups, []);
});
