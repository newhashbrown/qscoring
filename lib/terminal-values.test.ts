import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { classifyExitPair, exitPricesWithTerminals, type TerminalStore } from "./terminal-values";
import { cohortStats } from "./forward-returns";

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// Real Phase-B shapes: MASI halted at the deal price, RZB redeemed near par.
const TERMINALS: TerminalStore = {
  MASI: { lastBarDate: "2026-06-12", close: 179.95 },
  RZB: { lastBarDate: "2026-06-16", close: 25.34 },
  BKRPT: { lastBarDate: "2026-06-20", close: 0.04 }, // bankruptcy-style
};

// ─── exitPricesWithTerminals ─────────────────────────────────
test("terminal applies to end dates on/after its last bar (carried forward)", () => {
  const merged = exitPricesWithTerminals(new Map(), TERMINALS, "2026-06-25");
  strictEqual(merged.get("MASI"), 179.95);
  strictEqual(merged.get("RZB"), 25.34);
  strictEqual(merged.get("BKRPT"), 0.04);
});

test("terminal does NOT apply to end dates before its last bar", () => {
  // The name was still trading then — a real bar (snapshot or exit store)
  // must be the source, never a future terminal (look-ahead).
  const merged = exitPricesWithTerminals(new Map(), TERMINALS, "2026-06-15");
  strictEqual(merged.get("MASI"), 179.95); // 06-12 ≤ 06-15 → applies
  strictEqual(merged.get("RZB"), undefined); // last bar 06-16 is after
  strictEqual(merged.get("BKRPT"), undefined);
});

test("a real exit-price row for the end date wins over the terminal", () => {
  const exitPrices = new Map<string, number>([["MASI", 180.11]]);
  const merged = exitPricesWithTerminals(exitPrices, TERMINALS, "2026-06-25");
  strictEqual(merged.get("MASI"), 180.11);
  strictEqual(merged.get("RZB"), 25.34); // still filled from terminals
});

test("empty terminals → the exit-price map passes through unchanged", () => {
  const exitPrices = new Map<string, number>([["X", 42]]);
  const merged = exitPricesWithTerminals(exitPrices, {}, "2026-06-25");
  strictEqual(merged.get("X"), 42);
  strictEqual(merged.size, 1);
});

test("malformed terminal rows (non-finite/negative close) are ignored", () => {
  const bad: TerminalStore = {
    A: { lastBarDate: "2026-06-01", close: NaN },
    B: { lastBarDate: "2026-06-01", close: -5 },
  };
  const merged = exitPricesWithTerminals(new Map(), bad, "2026-06-25");
  strictEqual(merged.size, 0);
});

// ─── classifyExitPair (the builder's terminal-creation gate) ─
test("classifyExitPair: bar on the end date → fill (Phase A row)", () => {
  strictEqual(
    classifyExitPair({ hasBarOnEnd: true, lastBarDate: "2026-06-12", endDate: "2026-06-25", hasRecordedTerminal: false }),
    "fill"
  );
});

test("classifyExitPair: a real bar wins even when a terminal is on record", () => {
  strictEqual(
    classifyExitPair({ hasBarOnEnd: true, lastBarDate: "2026-07-01", endDate: "2026-06-25", hasRecordedTerminal: true }),
    "fill"
  );
});

test("classifyExitPair: recorded terminal covers the pair (no re-fetch)", () => {
  strictEqual(
    classifyExitPair({ hasBarOnEnd: false, lastBarDate: "2026-06-12", endDate: "2026-06-25", hasRecordedTerminal: true }),
    "covered-by-terminal"
  );
});

test("classifyExitPair: history stops before the end date → terminal candidate", () => {
  strictEqual(
    classifyExitPair({ hasBarOnEnd: false, lastBarDate: "2026-06-12", endDate: "2026-06-25", hasRecordedTerminal: false }),
    "terminal-candidate"
  );
});

test("classifyExitPair: bars after the end date (gap) or no bars at all → gap, never a terminal", () => {
  strictEqual(
    classifyExitPair({ hasBarOnEnd: false, lastBarDate: "2026-07-01", endDate: "2026-06-25", hasRecordedTerminal: false }),
    "gap"
  );
  strictEqual(
    classifyExitPair({ hasBarOnEnd: false, lastBarDate: undefined, endDate: "2026-06-25", hasRecordedTerminal: false }),
    "gap"
  );
});

// ─── a terminaled ticker that RESUMES trading (bad-flag case) ─
test("cohortStats: a real end-snapshot price overrides a stale terminal", () => {
  // If FMP wrongly flagged a halted-but-live ticker delisted and it resumes,
  // its real prices must win everywhere a real price exists.
  const pick = (ticker: string, price: number, score: number) => ({
    ticker,
    price,
    composite: score,
    longTermScore: score,
    shortTermScore: score,
  });
  const start = { date: "2026-06-12", picks: [pick("A", 100, 50), pick("HALT", 100, 10)] };
  const end = { date: "2026-06-25", picks: [pick("A", 110, 50), pick("HALT", 95, 10)] };
  const stale: TerminalStore = { HALT: { lastBarDate: "2026-06-13", close: 0.5 } };
  const exitPrices = exitPricesWithTerminals(new Map(), stale, "2026-06-25");
  const cs = cohortStats(start, end, "composite", { minN: 0, exitPrices })!;
  strictEqual(cs.n, 2);
  // HALT joins at its REAL end-snapshot price (95 → −5%), not the stale 0.5.
  strictEqual(approx(cs.quintileReturns[4], -0.05), true);
});

// ─── acceptance criterion from issue #60: the −100% case ─────
test("cohortStats: a bankrupt name is included at ≈ −100%, not survivorship-dropped", () => {
  const pick = (ticker: string, price: number, score: number) => ({
    ticker,
    price,
    composite: score,
    longTermScore: score,
    shortTermScore: score,
  });
  const start = {
    date: "2026-06-12",
    picks: [
      pick("A", 100, 50),
      pick("B", 100, 40),
      pick("C", 100, 30),
      pick("D", 100, 20),
      pick("BKRPT", 100, 10),
    ],
  };
  const end = {
    date: "2026-06-25",
    picks: [pick("A", 110, 50), pick("B", 108, 40), pick("C", 106, 30), pick("D", 104, 20)],
  };
  const exitPrices = exitPricesWithTerminals(new Map(), TERMINALS, "2026-06-25");

  const dropped = cohortStats(start, end, "composite", { minN: 0 })!;
  strictEqual(dropped.n, 4); // survivorship drop without Phase B

  const cs = cohortStats(start, end, "composite", { minN: 0, exitPrices })!;
  strictEqual(cs.n, 5); // included
  // BKRPT: 0.04/100 − 1 ≈ −99.96% — worst return, lowest score → IC stays +1.
  strictEqual(approx(cs.ic, 1), true);
  // bottom quintile is the winsorized bankruptcy (−0.5 after clip)
  strictEqual(approx(cs.quintileReturns[4], -0.5), true);
});
