import { test } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import {
  presentValue,
  solveImpliedGrowth,
  normalizedBaseFcf,
  fcfCagr,
  DCF_YEARS,
  G_MIN,
  G_MAX,
} from "./reverse-dcf";

// ─── presentValue ────────────────────────────────────────────────────────────
test("presentValue: strictly increasing in g when r > gT", () => {
  const r = 0.09;
  const gT = 0.025;
  let prev = -Infinity;
  for (let g = -0.4; g <= 1.5; g += 0.1) {
    const pv = presentValue(100, g, r, gT);
    ok(pv > prev, `PV should increase at g=${g.toFixed(2)}`);
    prev = pv;
  }
});

test("presentValue: matches a hand-checked one-year toy case", () => {
  // 1-year horizon, g=0: PV = FCF₀(1)/(1+r) + [FCF₀(1)(1+gT)/(r−gT)]/(1+r)
  const r = 0.1;
  const gT = 0.0;
  const fcf = 100;
  const expected = fcf / 1.1 + (fcf * 1) / (r - gT) / 1.1; // 90.909… + 909.09… = 1000
  const pv = presentValue(fcf, 0, r, gT, 1);
  ok(Math.abs(pv - expected) < 1e-9);
  ok(Math.abs(pv - 1000) < 1e-9);
});

// ─── solveImpliedGrowth: the round-trip proof ────────────────────────────────
test("solveImpliedGrowth: recovers the growth used to build the price", () => {
  const r = 0.09;
  const gT = 0.025;
  const baseFcf = 5_000;
  for (const gTrue of [-0.1, 0, 0.03, 0.08, 0.15, 0.4]) {
    const marketCap = presentValue(baseFcf, gTrue, r, gT);
    const res = solveImpliedGrowth({ marketCap, baseFcf, costOfEquity: r, terminalGrowth: gT });
    strictEqual(res.kind, "ok");
    if (res.kind === "ok") {
      ok(Math.abs(res.growth - gTrue) < 1e-6, `expected ${gTrue}, got ${res.growth}`);
    }
  }
});

test("solveImpliedGrowth: higher price ⇒ higher implied growth (monotone)", () => {
  const common = { baseFcf: 1_000, costOfEquity: 0.09, terminalGrowth: 0.025 };
  const lo = solveImpliedGrowth({ ...common, marketCap: 30_000 });
  const hi = solveImpliedGrowth({ ...common, marketCap: 60_000 });
  ok(lo.kind === "ok" && hi.kind === "ok");
  if (lo.kind === "ok" && hi.kind === "ok") ok(hi.growth > lo.growth);
});

// ─── solveImpliedGrowth: guards & clamps ─────────────────────────────────────
test("solveImpliedGrowth: rejects non-positive base FCF", () => {
  const res = solveImpliedGrowth({ marketCap: 1e9, baseFcf: -100, costOfEquity: 0.09, terminalGrowth: 0.025 });
  strictEqual(res.kind, "invalid");
});

test("solveImpliedGrowth: rejects discount rate ≤ terminal growth", () => {
  const res = solveImpliedGrowth({ marketCap: 1e9, baseFcf: 100, costOfEquity: 0.02, terminalGrowth: 0.025 });
  strictEqual(res.kind, "invalid");
});

test("solveImpliedGrowth: clamps below the floor when the price is tiny", () => {
  const floorPv = presentValue(1_000, G_MIN, 0.09, 0.025);
  const res = solveImpliedGrowth({ marketCap: floorPv / 2, baseFcf: 1_000, costOfEquity: 0.09, terminalGrowth: 0.025 });
  strictEqual(res.kind, "below_floor");
  if (res.kind === "below_floor") strictEqual(res.growth, G_MIN);
});

test("solveImpliedGrowth: clamps above the ceiling when the price is enormous", () => {
  const ceilPv = presentValue(1_000, G_MAX, 0.09, 0.025);
  const res = solveImpliedGrowth({ marketCap: ceilPv * 2, baseFcf: 1_000, costOfEquity: 0.09, terminalGrowth: 0.025 });
  strictEqual(res.kind, "above_ceiling");
  if (res.kind === "above_ceiling") strictEqual(res.growth, G_MAX);
});

// ─── normalizedBaseFcf ───────────────────────────────────────────────────────
test("normalizedBaseFcf: averages the most recent k values", () => {
  strictEqual(normalizedBaseFcf([100, 200, 300, 400], 3), (200 + 300 + 400) / 3);
});

test("normalizedBaseFcf: null on an empty series", () => {
  strictEqual(normalizedBaseFcf([]), null);
});

// ─── fcfCagr: the sign-change guard ──────────────────────────────────────────
test("fcfCagr: computes a clean positive-to-positive CAGR", () => {
  const c = fcfCagr([100, 200]); // doubled over 1 period → 100%
  ok(c !== null && Math.abs(c - 1.0) < 1e-9);
});

test("fcfCagr: null when the base year is non-positive (sign change)", () => {
  strictEqual(fcfCagr([-50, 100]), null);
  strictEqual(fcfCagr([0, 100]), null);
});

test("fcfCagr: null when the latest year is non-positive", () => {
  strictEqual(fcfCagr([100, -20]), null);
});

test("fcfCagr: null on a too-short series", () => {
  strictEqual(fcfCagr([100]), null);
});

test("horizon constant is the documented 10 years", () => {
  strictEqual(DCF_YEARS, 10);
});
