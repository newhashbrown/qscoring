import { test } from "node:test";
import assert from "node:assert/strict";

import { ewmaVolatility, scoreBetaLowAbs, scoreBetaNeutral } from "./risk-factor";
import type { PricePoint } from "./fmp";

// ---------------------------------------------------------------------------
// Synthetic price-series helpers (no FMP / no network).
// ---------------------------------------------------------------------------

// Build PricePoints from an array of daily log returns, OLDEST-first in the
// caller's array. Dates ascend by one day so the function's internal
// newest-first sort and any `date <= asOf` slicing behave like real data.
function seriesFromReturns(returnsOldestFirst: number[], startPrice = 100): PricePoint[] {
  const points: PricePoint[] = [];
  let price = startPrice;
  const start = Date.UTC(2024, 0, 1);
  // First point: the starting price, before any return is applied.
  points.push({
    symbol: "TEST",
    date: new Date(start).toISOString().slice(0, 10),
    price,
    volume: 1_000,
  });
  for (let i = 0; i < returnsOldestFirst.length; i++) {
    price *= Math.exp(returnsOldestFirst[i]);
    points.push({
      symbol: "TEST",
      date: new Date(start + (i + 1) * 86_400_000).toISOString().slice(0, 10),
      price,
      volume: 1_000,
    });
  }
  return points;
}

// Equal-weight (zero-mean RiskMetrics-style) annualized vol over a set of log
// returns — computed inline so the reactivity test isolates the *weighting*
// difference, not the mean-centering / (n-1) details of realizedVolatility.
function equalWeightVol(returns: number[]): number {
  const sumSq = returns.reduce((s, r) => s + r * r, 0);
  return Math.sqrt(sumSq / returns.length) * Math.sqrt(252);
}

// Zero-mean alternating returns of a given magnitude (±mag, ±mag, ...).
function alternating(mag: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? mag : -mag));
}

// Append genuinely-newer points to an oldest-first series: dates continue one
// day past the last point and the price path continues from the last price.
// (Using a separate seriesFromReturns would reuse the same date range and
// collide with `date <= asOf` slicing.)
function appendNewer(series: PricePoint[], returns: number[]): PricePoint[] {
  const last = series[series.length - 1];
  let price = last.price;
  const lastMs = Date.UTC(
    Number(last.date.slice(0, 4)),
    Number(last.date.slice(5, 7)) - 1,
    Number(last.date.slice(8, 10))
  );
  const extra: PricePoint[] = [];
  for (let i = 0; i < returns.length; i++) {
    price *= Math.exp(returns[i]);
    extra.push({
      symbol: "TEST",
      date: new Date(lastMs + (i + 1) * 86_400_000).toISOString().slice(0, 10),
      price,
      volume: 1_000,
    });
  }
  return [...series, ...extra];
}

// ---------------------------------------------------------------------------
// ewmaVolatility
// ---------------------------------------------------------------------------

test("ewmaVolatility returns null on short history", () => {
  // Fewer than MIN_RETURNS+1 (=21) price points → not enough returns.
  const short = seriesFromReturns(alternating(0.01, 5));
  assert.equal(ewmaVolatility(short), null);
});

test("ewmaVolatility returns a positive number on a noisy series", () => {
  const noisy = seriesFromReturns(alternating(0.02, 80));
  const vol = ewmaVolatility(noisy);
  assert.notEqual(vol, null);
  assert.ok((vol as number) > 0, "EWMA vol should be strictly positive");
  assert.ok(Number.isFinite(vol as number));
});

test("ewmaVolatility weights RECENT returns more than equal-weight stdev (regime jump)", () => {
  // Construct a series whose volatility regime JUMPS recently. Oldest-first
  // array: a long LOW-vol block, then a recent HIGH-vol block. Zero-mean
  // alternating in both blocks so the ONLY thing that differs between EWMA and
  // equal-weight is the exponential weighting of recent vs old returns.
  const LOW = 0.005;
  const HIGH = 0.05;
  const oldReturns = alternating(LOW, 60); // older, low vol
  const recentReturns = alternating(HIGH, 24); // newer, high vol (> ~16d EWMA memory)
  const returnsOldestFirst = [...oldReturns, ...recentReturns];

  const series = seriesFromReturns(returnsOldestFirst);
  const ewma = ewmaVolatility(series) as number;

  // Equal-weight comparator over the SAME set of returns.
  const equal = equalWeightVol(returnsOldestFirst);

  assert.ok(ewma > equal,
    `EWMA (${ewma.toFixed(4)}) should exceed equal-weight (${equal.toFixed(4)}) ` +
    "because the recent regime is high-vol and EWMA over-weights recent returns");

  // Sanity: EWMA should sit much closer to the pure high-vol level than the
  // pure low-vol level, confirming it tracks the recent regime.
  const lowVol = equalWeightVol(oldReturns);
  const highVol = equalWeightVol(recentReturns);
  assert.ok(Math.abs(ewma - highVol) < Math.abs(ewma - lowVol),
    "EWMA should be closer to the recent high-vol regime than the old low-vol regime");
});

test("ewmaVolatility is point-in-time: as-of value unchanged when later points appended", () => {
  const base = seriesFromReturns(alternating(0.015, 80));
  // Pick an as-of cut and remember its date.
  const asOfIndex = 50;
  const asOfSlice = base.slice(0, asOfIndex + 1);
  const asOfDate = asOfSlice[asOfSlice.length - 1].date;

  const v1 = ewmaVolatility(asOfSlice);
  assert.notEqual(v1, null);

  // Append chronologically NEWER points (a fresh high-vol regime) to the full
  // series, then slice back to the as-of date. Point-in-time means the as-of
  // value is identical: the function reads only prices ≤ as-of.
  const extended = appendNewer(base, alternating(0.06, 30));
  const asOfFromExtended = extended.filter((p) => p.date <= asOfDate);
  const v2 = ewmaVolatility(asOfFromExtended);

  assert.equal(v2, v1);

  // And confirm we are NOT silently ignoring the newer data: the full extended
  // series (newer high-vol regime) yields a different number.
  const vFull = ewmaVolatility(extended);
  assert.notEqual(vFull, v1);
});

test("ewmaVolatility is order-independent (shuffled input)", () => {
  const series = seriesFromReturns(alternating(0.02, 60));
  const shuffled = [...series].reverse(); // oldest-first instead of newest-first
  assert.equal(ewmaVolatility(shuffled), ewmaVolatility(series));
});

// ---------------------------------------------------------------------------
// scoreBetaLowAbs — reward low |beta|
// ---------------------------------------------------------------------------

test("scoreBetaLowAbs is monotonic decreasing in |beta| and within [0,100]", () => {
  // Non-saturated range so the comparison is strict-ish; assert non-increasing.
  const betas = [0, 0.25, 0.5, 0.8, 1.0, 1.5, 2.0];
  const scores = betas.map((b) => scoreBetaLowAbs(b) as number);

  for (const s of scores) {
    assert.ok(s >= 0 && s <= 100, `score ${s} out of [0,100]`);
  }
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] <= scores[i - 1],
      `score should not increase as |beta| grows: ${scores[i - 1]} -> ${scores[i]}`);
  }
  // |beta|=0 is the maximum.
  assert.equal(scores[0], 100);
});

test("scoreBetaLowAbs treats negative beta by magnitude", () => {
  assert.equal(scoreBetaLowAbs(-0.6), scoreBetaLowAbs(0.6));
});

test("scoreBetaLowAbs is null-safe", () => {
  assert.equal(scoreBetaLowAbs(null), null);
  assert.equal(scoreBetaLowAbs(undefined), null);
  assert.equal(scoreBetaLowAbs(NaN), null);
});

// ---------------------------------------------------------------------------
// scoreBetaNeutral — reward beta near target
// ---------------------------------------------------------------------------

test("scoreBetaNeutral peaks at target and is within [0,100]", () => {
  const target = 1.0;
  const peak = scoreBetaNeutral(target, target) as number;
  assert.ok(peak <= 100 && peak >= 0);

  // Moving away from target in either direction lowers (or holds) the score.
  for (const delta of [0.2, 0.5, 1.0, 2.0]) {
    const above = scoreBetaNeutral(target + delta, target) as number;
    const below = scoreBetaNeutral(target - delta, target) as number;
    assert.ok(above <= peak, `score above target (Δ=${delta}) should be <= peak`);
    assert.ok(below <= peak, `score below target (Δ=${delta}) should be <= peak`);
    assert.ok(above >= 0 && above <= 100);
    assert.ok(below >= 0 && below <= 100);
  }

  // Symmetry around the target.
  assert.equal(scoreBetaNeutral(target + 0.3, target), scoreBetaNeutral(target - 0.3, target));
});

test("scoreBetaNeutral honors a custom target", () => {
  // With target 0, beta==0 should beat beta==1.
  assert.ok((scoreBetaNeutral(0, 0) as number) > (scoreBetaNeutral(1, 0) as number));
});

test("scoreBetaNeutral is null-safe", () => {
  assert.equal(scoreBetaNeutral(null), null);
  assert.equal(scoreBetaNeutral(undefined), null);
  assert.equal(scoreBetaNeutral(NaN), null);
});
