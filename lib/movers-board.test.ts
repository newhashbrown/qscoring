import { test } from "node:test";
import { strictEqual, deepStrictEqual, throws } from "node:assert/strict";
import type { ScoreboardPick } from "@/data/categories";
import type { Signal } from "@/lib/scoring/types";
import { reconcile, stanceOf, isDivergence, type DatedSnapshot } from "./movers-board";

// ── fixtures ──────────────────────────────────────────────────────────────

function pick(
  ticker: string,
  opts: {
    signal?: Signal;
    composite?: number;
    changePercent?: number;
    price?: number;
    factors?: [number, number, number, number, number]; // V,G,M,P,R
  } = {}
): ScoreboardPick {
  const [v, g, m, p, r] = opts.factors ?? [50, 50, 50, 50, 50];
  return {
    ticker,
    companyName: `${ticker} Inc.`,
    sector: "Technology",
    price: opts.price ?? 100,
    changePercent: opts.changePercent ?? 0,
    composite: opts.composite ?? 50,
    signal: opts.signal ?? "HOLD",
    confidence: "HIGH",
    longTermScore: opts.composite ?? 50,
    shortTermScore: opts.composite ?? 50,
    categories: [
      { name: "value", label: "Value", score: v },
      { name: "growth", label: "Growth", score: g },
      { name: "momentum", label: "Momentum", score: m },
      { name: "profitability", label: "Profitability", score: p },
      { name: "risk", label: "Risk", score: r },
    ],
  };
}

// Prior snapshot: two bullish (one by signal, one by composite), two bearish
// (one by signal, one by composite), two neutral, and BULL carries distinct
// factor scores so we can assert factor extraction.
const PRIOR: DatedSnapshot = {
  date: "2026-06-03",
  picks: [
    pick("BULL", { signal: "BUY_LONG_TERM", composite: 72, price: 90, factors: [80, 70, 60, 50, 40] }),
    pick("BULLD", { signal: "HOLD", composite: 68, price: 110 }), // bullish via composite
    pick("BEAR", { signal: "SHORT", composite: 30, price: 50 }),
    pick("BEARD", { signal: "HOLD", composite: 28, price: 25 }), // bearish via composite
    pick("NEUT", { signal: "HOLD", composite: 50, price: 40 }),
    pick("NEUTD", { signal: "HOLD", composite: 52, price: 60 }),
  ],
};

const TODAY: DatedSnapshot = {
  date: "2026-06-04",
  picks: [
    pick("BULL", { changePercent: 4.2, price: 93 }), //  up + bullish  → confirmed_strength
    pick("BEAR", { changePercent: 6.0, price: 53 }), //  up + bearish  → unsupported_pop (divergence)
    pick("NEUT", { changePercent: 3.1, price: 41 }), //  up + neutral  → unscored_pop
    pick("BEARD", { changePercent: -5.5, price: 23 }), // down + bearish → confirmed_weakness
    pick("BULLD", { changePercent: -4.0, price: 105 }), // down + bullish → dislocation (divergence)
    pick("NEUTD", { changePercent: -2.2, price: 58 }), // down + neutral → unscored_drop
    pick("NEW", { changePercent: 9.9, price: 12 }), //    up, no prior  → unscored_pop, null fields
  ],
};

function rowFor(rows: ReturnType<typeof reconcile>, ticker: string) {
  const r = rows.find((x) => x.ticker === ticker);
  if (!r) throw new Error(`no row for ${ticker}`);
  return r;
}

// ── stanceOf: signal precedence over composite ──────────────────────────────

test("stanceOf: Short signal is bearish even with a high composite", () => {
  strictEqual(stanceOf("SHORT", 95), "bearish");
});

test("stanceOf: Buy signal is bullish even with a low composite", () => {
  strictEqual(stanceOf("BUY_LONG_TERM", 5), "bullish");
  strictEqual(stanceOf("BUY_SHORT_TERM", 5), "bullish");
});

test("stanceOf: HOLD falls through to composite thresholds (65 / 35)", () => {
  strictEqual(stanceOf("HOLD", 65), "bullish");
  strictEqual(stanceOf("HOLD", 64.9), "neutral");
  strictEqual(stanceOf("HOLD", 35), "bearish");
  strictEqual(stanceOf("HOLD", 35.1), "neutral");
  strictEqual(stanceOf("HOLD", 50), "neutral");
});

// ── reconcile: all six alignment cases ──────────────────────────────────────

test("reconcile: up + bullish → confirmed_strength", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "BULL");
  strictEqual(r.stance, "bullish");
  strictEqual(r.alignment, "confirmed_strength");
  strictEqual(isDivergence(r.alignment), false);
});

test("reconcile: up + bearish → unsupported_pop (divergence)", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "BEAR");
  strictEqual(r.stance, "bearish");
  strictEqual(r.alignment, "unsupported_pop");
  strictEqual(isDivergence(r.alignment), true);
});

test("reconcile: up + neutral → unscored_pop", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "NEUT");
  strictEqual(r.stance, "neutral");
  strictEqual(r.alignment, "unscored_pop");
});

test("reconcile: down + bearish → confirmed_weakness", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "BEARD");
  strictEqual(r.stance, "bearish");
  strictEqual(r.alignment, "confirmed_weakness");
});

test("reconcile: down + bullish → dislocation (divergence)", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "BULLD");
  strictEqual(r.stance, "bullish");
  strictEqual(r.alignment, "dislocation");
  strictEqual(isDivergence(r.alignment), true);
});

test("reconcile: down + neutral → unscored_drop", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "NEUTD");
  strictEqual(r.stance, "neutral");
  strictEqual(r.alignment, "unscored_drop");
});

// ── reconcile: missing-prior-score case ─────────────────────────────────────

test("reconcile: ticker absent from prior snapshot → unscored, all model fields null", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "NEW");
  strictEqual(r.stance, null);
  strictEqual(r.alignment, "unscored_pop");
  strictEqual(r.priorComposite, null);
  strictEqual(r.priorSignal, null);
  strictEqual(r.prevClose, null);
  strictEqual(r.scoreDate, null);
  deepStrictEqual(r.factors, {
    value: null,
    growth: null,
    momentum: null,
    profitability: null,
    risk: null,
  });
  // Note must not imply a prior read existed.
  strictEqual(/no prior-day score on record/.test(r.alignmentNote), true);
});

test("reconcile: prior=null (earliest snapshot) → every row unscored with null fields", () => {
  const rows = reconcile(TODAY, null);
  strictEqual(rows.length, TODAY.picks.length);
  for (const r of rows) {
    strictEqual(r.stance, null);
    strictEqual(r.priorComposite, null);
    strictEqual(r.scoreDate, null);
  }
});

// ── reconcile: data plumbing ────────────────────────────────────────────────

test("reconcile: day return is change_percent verbatim; close/prevClose/scoreDate plumbed", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "BULL");
  strictEqual(r.dayReturnPct, 4.2);
  strictEqual(r.close, 93);
  strictEqual(r.prevClose, 90); // prior snapshot's price
  strictEqual(r.scoreDate, "2026-06-03");
  strictEqual(r.priorComposite, 72);
  strictEqual(r.priorSignal, "BUY_LONG_TERM");
});

test("reconcile: 5 factor scores pulled from the prior pick's categories", () => {
  const r = rowFor(reconcile(TODAY, PRIOR), "BULL");
  deepStrictEqual(r.factors, {
    value: 80,
    growth: 70,
    momentum: 60,
    profitability: 50,
    risk: 40,
  });
});

test("reconcile: drops picks with a non-finite change_percent", () => {
  const today: DatedSnapshot = {
    date: "2026-06-04",
    picks: [pick("BULL", { changePercent: NaN }), pick("BEAR", { changePercent: 6 })],
  };
  const rows = reconcile(today, PRIOR);
  strictEqual(rows.length, 1);
  strictEqual(rows[0].ticker, "BEAR");
});

// ── reconcile: anti-lookahead guard ─────────────────────────────────────────

test("reconcile: throws if prior snapshot is not strictly before today", () => {
  throws(
    () => reconcile(TODAY, { ...PRIOR, date: "2026-06-04" }),
    /not strictly before/
  );
  throws(
    () => reconcile(TODAY, { ...PRIOR, date: "2026-06-05" }),
    /not strictly before/
  );
});
