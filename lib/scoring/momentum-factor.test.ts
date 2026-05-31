import { test } from "node:test";
import assert from "node:assert/strict";

import type { PricePoint } from "./fmp";
import { volScaledMomentum12_1, scoreVolScaledMomentum } from "./momentum-factor";

/**
 * Build a newest-first PricePoint[] from an array of prices ordered
 * NEWEST-FIRST (index 0 = most recent). Dates descend from a fixed anchor so
 * the defensive sort inside the factor is deterministic and a no-op.
 */
function makeHistory(pricesNewestFirst: number[]): PricePoint[] {
  const anchor = Date.UTC(2026, 0, 1); // 2026-01-01
  return pricesNewestFirst.map((price, i) => ({
    symbol: "TEST",
    // i days before the anchor → index 0 is the most recent date.
    date: new Date(anchor - i * 86_400_000).toISOString().slice(0, 10),
    price,
    volume: 1_000_000,
  }));
}

/**
 * A geometric price path of `n` points with a small deterministic wobble, so
 * realized vol is modest-but-real (not machine-epsilon — a pure ramp has
 * exactly-zero variance, which would null the signal). `recent` is price[21],
 * `past` is price[252]; we pin those exactly so the 12-1 leg is controlled and
 * the recent month (indices 0..20) is flat at `recent`.
 */
function smoothSeries(opts: { recent: number; past: number; n?: number }): number[] {
  const n = opts.n ?? 260;
  const prices: number[] = new Array(n);
  // Flat most-recent month: indices 0..21 all equal `recent`.
  for (let i = 0; i <= 21; i++) prices[i] = opts.recent;
  // Geometric ramp from price[252] = past up to price[21] = recent across the
  // 231-step 12-1 window (indices 21..252).
  const ratio = Math.pow(opts.recent / opts.past, 1 / (252 - 21));
  for (let i = 22; i < n; i++) {
    // Walk backwards in time (older = larger index) → divide by ratio each step,
    // plus a tiny alternating wobble so the window has genuine (low) variance.
    const wobble = i % 2 === 0 ? 1.002 : 0.998;
    prices[i] = (prices[i - 1] / ratio) * wobble;
  }
  // Re-pin the anchor exactly so the 12-1 numerator is unaffected by wobble.
  if (n > 252) prices[252] = opts.past;
  return prices;
}

test("returns null when history has fewer than 253 points", () => {
  const short = makeHistory(new Array(252).fill(100).map((p, i) => p + i));
  assert.equal(volScaledMomentum12_1(short), null);
});

test("returns a finite number for sufficient history", () => {
  const h = makeHistory(smoothSeries({ recent: 130, past: 100 }));
  const v = volScaledMomentum12_1(h);
  assert.equal(typeof v, "number");
  assert.ok(Number.isFinite(v as number));
});

test("12-1 skip: a spike confined to the most recent ~21 days does not change the signal", () => {
  const base = smoothSeries({ recent: 120, past: 100 });
  const withSpike = [...base];
  // Inject a large spike across indices 0..20 (the skipped recent month).
  for (let i = 0; i <= 20; i++) withSpike[i] = base[i] * 3;

  const vBase = volScaledMomentum12_1(makeHistory(base));
  const vSpike = volScaledMomentum12_1(makeHistory(withSpike));

  assert.notEqual(vBase, null);
  // Identical: the recent month is excluded from both numerator and vol.
  assert.equal(vSpike, vBase);
});

test("vol-scaling: same 12-1 return, higher volatility yields smaller-magnitude signal", () => {
  // Both series share price[21]=120 and price[252]=100 → identical numerator.
  const smooth = smoothSeries({ recent: 120, past: 100 });

  // Jagged variant: same endpoints, but oscillate the in-window prices to raise
  // realized vol without changing price[21] or price[252].
  const jagged = [...smooth];
  for (let i = 22; i < 252; i++) {
    const wobble = i % 2 === 0 ? 1.06 : 0.94;
    jagged[i] = smooth[i] * wobble;
  }

  const vSmooth = volScaledMomentum12_1(makeHistory(smooth));
  const vJagged = volScaledMomentum12_1(makeHistory(jagged));

  assert.notEqual(vSmooth, null);
  assert.notEqual(vJagged, null);
  // Same positive numerator, larger denominator → smaller magnitude.
  assert.ok(
    Math.abs(vJagged as number) < Math.abs(vSmooth as number),
    `expected |${vJagged}| < |${vSmooth}|`
  );
});

test("point-in-time invariance: future data sliced off does not change the as-of value", () => {
  const asOfIndex = 20; // ≤ SKIP_DAYS, so newer data lands inside the skipped month
  // History as of the older as-of date (length 280, still ≥ 253).
  const asOfView = smoothSeries({ recent: 120, past: 100, n: 300 }).slice(asOfIndex);
  const vAsOf = volScaledMomentum12_1(makeHistory(asOfView));
  assert.notEqual(vAsOf, null);

  // "Later points appended": prepend `asOfIndex` brand-new, wildly different
  // recent points (data that arrived AFTER the as-of date). Slicing them back
  // off must reproduce the as-of value exactly — a genuine round-trip, not the
  // same array compared to itself.
  const wild = Array.from({ length: asOfIndex }, (_, i) => 500 + i * 7);
  const withFuture = [...wild, ...asOfView];
  const vReslice = volScaledMomentum12_1(makeHistory(withFuture.slice(asOfIndex)));
  assert.equal(vReslice, vAsOf);

  // Converse: NOT re-slicing shifts index 0 to the wild data, so the value MUST
  // change — proves the equality above is meaningful, not the fn ignoring input.
  const vWithFuture = volScaledMomentum12_1(makeHistory(withFuture));
  assert.notEqual(vWithFuture, vAsOf);
});

test("scoreVolScaledMomentum returns a value within [0, 100]", () => {
  const h = makeHistory(smoothSeries({ recent: 140, past: 100 }));
  const s = scoreVolScaledMomentum(h, "Technology");
  assert.notEqual(s, null);
  assert.ok((s as number) >= 0 && (s as number) <= 100, `score ${s} out of range`);
});

test("scoreVolScaledMomentum is monotonic in the raw signal", () => {
  // Same vol-scaling pair: smooth has a larger raw signal than jagged
  // (proven above), so its score must be >= jagged's.
  const smooth = smoothSeries({ recent: 120, past: 100 });
  const jagged = [...smooth];
  for (let i = 22; i < 252; i++) {
    const wobble = i % 2 === 0 ? 1.06 : 0.94;
    jagged[i] = smooth[i] * wobble;
  }

  const sSmooth = scoreVolScaledMomentum(makeHistory(smooth), null);
  const sJagged = scoreVolScaledMomentum(makeHistory(jagged), null);

  assert.notEqual(sSmooth, null);
  assert.notEqual(sJagged, null);
  // Larger positive raw → larger score.
  assert.ok(
    (sSmooth as number) > (sJagged as number),
    `expected smooth score ${sSmooth} > jagged score ${sJagged}`
  );

  // Centering sanity: a ~flat 12-1 return (tiny numerator, but real
  // volatility so the denominator is well-defined) scores near 50.
  const flat = smoothSeries({ recent: 100.01, past: 100 });
  for (let i = 22; i < 252; i++) {
    const wobble = i % 2 === 0 ? 1.01 : 0.99;
    flat[i] = flat[i] * wobble;
  }
  const sFlat = scoreVolScaledMomentum(makeHistory(flat), null);
  assert.notEqual(sFlat, null);
  assert.ok(Math.abs((sFlat as number) - 50) < 2, `flat score ${sFlat} not ~50`);
});

test("returns null on zero prices at the window anchors", () => {
  const prices = smoothSeries({ recent: 120, past: 100 });
  prices[252] = 0; // bad data at the 12-month anchor
  assert.equal(volScaledMomentum12_1(makeHistory(prices)), null);
});
