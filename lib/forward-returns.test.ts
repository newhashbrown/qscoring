import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import {
  cohortStats,
  computeHorizonResults,
  summarizeForwardReturns,
  MIN_COHORT_N,
  type ScoreKey,
} from "./forward-returns";
import { HORIZONS } from "./performance";

const approx = (a: number | null, b: number, eps = 1e-6) =>
  a !== null && Math.abs(a - b) < eps;

type TestPick = {
  ticker: string;
  price: number;
  composite: number;
  longTermScore: number;
  shortTermScore: number;
};

function pick(ticker: string, price: number, score: number): TestPick {
  return {
    ticker,
    price,
    composite: score,
    longTermScore: score,
    shortTermScore: score,
  };
}

function snap(date: string, picks: TestPick[]) {
  return { date, picks };
}

// ─── cohortStats ─────────────────────────────────────────────
test("cohortStats: higher score → higher forward return gives IC near +1", () => {
  const start = snap("2026-05-01", [
    pick("A", 100, 10),
    pick("B", 100, 20),
    pick("C", 100, 30),
    pick("D", 100, 40),
    pick("E", 100, 50),
  ]);
  const end = snap("2026-06-01", [
    pick("A", 100, 10), // ret 0.00
    pick("B", 105, 20), // ret 0.05
    pick("C", 110, 30), // ret 0.10
    pick("D", 115, 40), // ret 0.15
    pick("E", 120, 50), // ret 0.20
  ]);
  const cs = cohortStats(start, end, "composite", { minN: 0 })!;
  strictEqual(cs.n, 5);
  strictEqual(approx(cs.ic, 1), true);
  strictEqual(cs.quintileReturns.length, 5);
  // top-score quintile (E, +0.20) minus bottom (A, 0.00)
  strictEqual(approx(cs.spread, 0.2), true);
});

test("cohortStats: inverse relationship gives IC near -1", () => {
  const start = snap("2026-05-01", [
    pick("A", 100, 10),
    pick("B", 100, 20),
    pick("C", 100, 30),
  ]);
  const end = snap("2026-06-01", [
    pick("A", 130, 10), // high return, low score
    pick("B", 120, 20),
    pick("C", 110, 30), // low return, high score
  ]);
  const cs = cohortStats(start, end, "composite", { minN: 0 })!;
  strictEqual(approx(cs.ic, -1), true);
});

test("cohortStats: drops tickers missing from the end snapshot (survivorship)", () => {
  const start = snap("2026-05-01", [
    pick("A", 100, 10),
    pick("B", 100, 20),
    pick("C", 100, 30),
    pick("D", 100, 40),
    pick("E", 100, 50),
  ]);
  const end = snap("2026-06-01", [
    pick("A", 105, 10),
    pick("B", 110, 20),
    pick("C", 115, 30),
    pick("D", 120, 40),
    // E delisted / dropped from universe
  ]);
  const cs = cohortStats(start, end, "composite", { minN: 0 })!;
  strictEqual(cs.n, 4);
});

test("cohortStats: an exited name is INCLUDED via the exit-price store (survivorship fix #60)", () => {
  const start = snap("2026-05-01", [
    pick("A", 100, 10),
    pick("B", 100, 20),
    pick("C", 100, 30),
    pick("D", 100, 40),
    pick("E", 100, 50),
  ]);
  const end = snap("2026-06-01", [
    pick("A", 105, 10),
    pick("B", 110, 20),
    pick("C", 115, 30),
    pick("D", 120, 40),
    // E left the universe by the end date — absent from end.picks …
  ]);
  // … but its real settled close on the end date is in the exit-price store.
  const exitPrices = new Map<string, number>([["E", 130]]); // ret +0.30
  const cs = cohortStats(start, end, "composite", { minN: 0, exitPrices })!;
  strictEqual(cs.n, 5); // E is no longer survivorship-dropped
  // E (score 50, +0.30) tops the spread; A (score 10, +0.05) bottoms it.
  strictEqual(approx(cs.spread, 0.25), true);
});

test("cohortStats: a name with no end price anywhere is still dropped (no fabrication)", () => {
  const start = snap("2026-05-01", [
    pick("A", 100, 10),
    pick("B", 100, 20),
    pick("C", 100, 30),
    pick("D", 100, 40),
    pick("E", 100, 50),
  ]);
  const end = snap("2026-06-01", [
    pick("A", 105, 10),
    pick("B", 110, 20),
    pick("C", 115, 30),
    pick("D", 120, 40),
  ]);
  const exitPrices = new Map<string, number>([["Z", 999]]); // unrelated ticker
  const cs = cohortStats(start, end, "composite", { minN: 0, exitPrices })!;
  strictEqual(cs.n, 4); // E still dropped — the store has no price for it
});

test("cohortStats: winsorizes extreme returns in the quintile spread (split protection)", () => {
  // Lowest-score name suffers a split-like -95% print; it must be clipped to
  // -50% for the spread mean, while the IC (rank-based) is unaffected.
  const start = snap("2026-05-01", [
    pick("A", 100, 10),
    pick("B", 100, 20),
    pick("C", 100, 30),
    pick("D", 100, 40),
    pick("E", 100, 50),
  ]);
  const end = snap("2026-06-01", [
    pick("A", 5, 10), // ret -0.95 → clipped to -0.50
    pick("B", 110, 20), // 0.10
    pick("C", 120, 30), // 0.20
    pick("D", 150, 40), // 0.50
    pick("E", 200, 50), // 1.00
  ]);
  const cs = cohortStats(start, end, "composite", { minN: 0 })!;
  strictEqual(approx(cs.ic, 1), true); // still monotonic by rank
  // spread = top (E, 1.00) − bottom (A, clipped −0.50) = 1.50 (NOT 1.95)
  strictEqual(approx(cs.spread, 1.5), true);
});

test("cohortStats: below minimum sample size → null", () => {
  const start = snap("2026-05-01", [pick("A", 100, 10), pick("B", 100, 20)]);
  const end = snap("2026-06-01", [pick("A", 110, 10), pick("B", 110, 20)]);
  strictEqual(cohortStats(start, end, "composite"), null); // default minN = MIN_COHORT_N
});

test("cohortStats: small curated-universe cohort is excluded by the floor", () => {
  // 66-name "strong picks" era: below MIN_COHORT_N, must not be reported.
  const picks = Array.from({ length: 66 }, (_, k) => pick(`T${k}`, 100, k));
  const ends = Array.from({ length: 66 }, (_, k) => pick(`T${k}`, 100 + k, k));
  strictEqual(cohortStats(snap("2026-05-13", picks), snap("2026-06-12", ends), "composite"), null);
});

// ─── computeHorizonResults ───────────────────────────────────
// Build 45 consecutive calendar days; price of ticker k grows with both its
// score and elapsed time, so every forward window has a perfect positive IC.
function syntheticFixture() {
  const dates: string[] = [];
  const base = new Date("2026-05-01T00:00:00Z");
  for (let d = 0; d < 45; d++) {
    const dt = new Date(base.getTime() + d * 86400000);
    dates.push(dt.toISOString().split("T")[0]);
  }
  const N = 700; // full-universe scale, above MIN_COHORT_N
  const load = (date: string) => {
    const dayIndex = dates.indexOf(date);
    if (dayIndex < 0) return null;
    const picks: TestPick[] = [];
    for (let k = 0; k < N; k++) {
      picks.push(pick(`T${k}`, 100 * (1 + (k / 1000) * (dayIndex + 1)), k));
    }
    return { date, picks };
  };
  const today = dates[dates.length - 1];
  return { dates, load, today };
}

test("computeHorizonResults: 1-month horizon available with strong positive IC", () => {
  const { dates, load, today } = syntheticFixture();
  const results = computeHorizonResults(dates, load, today, "composite");
  const oneMonth = results.find((r) => r.label === "1-month")!;
  strictEqual(oneMonth.available, true);
  strictEqual(oneMonth.cohortCount > 0, true);
  strictEqual((oneMonth.meanIC ?? 0) > 0.99, true);
  strictEqual((oneMonth.meanSpread ?? 0) > 0, true);
  strictEqual(oneMonth.latestCohort !== null, true);
});

test("computeHorizonResults: thin data is flagged preliminary", () => {
  const { dates, load, today } = syntheticFixture();
  const results = computeHorizonResults(dates, load, today, "composite");
  const oneMonth = results.find((r) => r.label === "1-month")!;
  // ~31 trading days elapsed → only one independent 21-day window fits
  strictEqual(oneMonth.independentWindows, 1);
  strictEqual(oneMonth.preliminary, true);
});

test("computeHorizonResults: horizons without enough elapsed time are unavailable", () => {
  const { dates, load, today } = syntheticFixture();
  const results = computeHorizonResults(dates, load, today, "composite");
  const threeMonth = results.find((r) => r.label === "3-month")!;
  strictEqual(threeMonth.available, false);
  strictEqual(threeMonth.meanIC, null);
  strictEqual(threeMonth.latestCohort, null);
});

test("computeHorizonResults: returns one entry per defined horizon", () => {
  const { dates, load, today } = syntheticFixture();
  const results = computeHorizonResults(dates, load, today, "composite");
  strictEqual(results.length, HORIZONS.length);
});

// ─── summarizeForwardReturns (reads committed snapshots) ─────
test("summarizeForwardReturns: live snapshots yield stable, honest invariants", () => {
  const results = summarizeForwardReturns();
  strictEqual(results.length, HORIZONS.length);

  // 1-year horizon cannot be ready for years.
  strictEqual(results.find((r) => r.label === "1-year")!.available, false);

  // Any horizon that IS reported must be over a real cross-section (full
  // universe) with an in-range mean IC — never the small curated-universe era.
  for (const r of results) {
    if (!r.available) {
      strictEqual(r.meanIC, null);
      strictEqual(r.latestCohort, null);
      continue;
    }
    strictEqual(r.latestCohort!.n >= MIN_COHORT_N, true);
    strictEqual(r.meanIC !== null && r.meanIC >= -1 && r.meanIC <= 1, true);
  }
});

// Type export smoke check (compile-time): ScoreKey must include the three keys.
const _scoreKeys: ScoreKey[] = ["composite", "longTermScore", "shortTermScore"];
void _scoreKeys;
