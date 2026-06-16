import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import {
  summarizeConsensus,
  ratingRevisionTrend,
  earningsSurpriseHistory,
  priceTargetRevision,
} from "./analyst";
import type { EarningsRow, GradeConsensus, GradeHistoryRow, PriceTargetSummary } from "./fmp";

const approx = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) < eps;

// ─── summarizeConsensus ──────────────────────────────────────
test("summarizeConsensus: aggregates buy/hold/sell and bullish share", () => {
  const c: GradeConsensus = { symbol: "X", strongBuy: 1, buy: 69, hold: 33, sell: 7, strongSell: 0, consensus: "Buy" };
  const s = summarizeConsensus(c)!;
  strictEqual(s.buyCount, 70);
  strictEqual(s.holdCount, 33);
  strictEqual(s.sellCount, 7);
  strictEqual(s.total, 110);
  strictEqual(approx(s.bullishPct, 70 / 110), true);
  strictEqual(s.label, "Buy");
});

test("summarizeConsensus: null input / zero coverage → null", () => {
  strictEqual(summarizeConsensus(null), null);
  strictEqual(summarizeConsensus({ symbol: "X", strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0, consensus: null }), null);
});

// ─── ratingRevisionTrend ─────────────────────────────────────
function grade(date: string, sb: number, b: number, h: number, s: number, ss: number): GradeHistoryRow {
  return {
    symbol: "X", date,
    analystRatingsStrongBuy: sb, analystRatingsBuy: b, analystRatingsHold: h,
    analystRatingsSell: s, analystRatingsStrongSell: ss,
  };
}

test("ratingRevisionTrend: rising bullish share → upgrading", () => {
  // now 80% bullish, 3mo ago 50% → +30pp.
  const hist = [
    grade("2026-06-01", 8, 0, 2, 0, 0), // 80%
    grade("2026-05-01", 7, 0, 3, 0, 0),
    grade("2026-04-01", 6, 0, 4, 0, 0),
    grade("2026-03-01", 5, 0, 5, 0, 0), // 50%
  ];
  const t = ratingRevisionTrend(hist, 3)!;
  strictEqual(t.direction, "upgrading");
  strictEqual(approx(t.shiftPoints, 30), true);
  strictEqual(t.toDate, "2026-06-01");
  strictEqual(t.fromDate, "2026-03-01");
});

test("ratingRevisionTrend: small swing → stable; <2 snapshots → null", () => {
  // 50% now vs 51% prior → −1pp, within the ±2pp stable band.
  const flat = [grade("2026-06-01", 50, 0, 50, 0, 0), grade("2026-03-01", 51, 0, 49, 0, 0)];
  strictEqual(ratingRevisionTrend(flat, 3)!.direction, "stable");
  strictEqual(ratingRevisionTrend([grade("2026-06-01", 5, 0, 5, 0, 0)], 3), null);
});

// ─── earningsSurpriseHistory ─────────────────────────────────
function earning(date: string, actual: number | null, est: number | null): EarningsRow {
  return { symbol: "X", date, epsActual: actual, epsEstimated: est, revenueActual: null, revenueEstimated: null };
}

test("earningsSurpriseHistory: only reported quarters, surprise % + beat rate", () => {
  const e = [
    earning("2026-07-30", null, 1.9), // upcoming — excluded
    earning("2026-04-30", 2.01, 1.95), // beat +3.08%
    earning("2026-01-30", 2.4, 2.5), // miss -4%
    earning("2025-10-30", 1.6, 1.5), // beat
  ];
  const h = earningsSurpriseHistory(e, 8);
  strictEqual(h.quarters.length, 3); // upcoming dropped
  strictEqual(h.quarters[0].date, "2026-04-30"); // most recent reported first
  strictEqual(approx(h.quarters[0].surprisePct!, (2.01 - 1.95) / 1.95), true);
  strictEqual(h.quarters[0].beat, true);
  strictEqual(h.quarters[1].beat, false);
  strictEqual(approx(h.beatRate!, 2 / 3), true);
});

// ─── priceTargetRevision (estimate-revision proxy) ───────────
function pts(lmAvg: number | null, lmCount: number, lqAvg: number | null, lqCount: number): PriceTargetSummary {
  return {
    symbol: "X",
    lastMonthCount: lmCount, lastMonthAvgPriceTarget: lmAvg,
    lastQuarterCount: lqCount, lastQuarterAvgPriceTarget: lqAvg,
    lastYearCount: 0, lastYearAvgPriceTarget: null,
  };
}

test("priceTargetRevision: targets raised >2% → raising", () => {
  const r = priceTargetRevision(pts(345, 3, 327.77, 13))!;
  strictEqual(r.direction, "raising");
  strictEqual(approx(r.changePct, (345 - 327.77) / 327.77), true);
  strictEqual(r.lastMonthCount, 3);
});

test("priceTargetRevision: cut >2% → lowering; small move → stable", () => {
  strictEqual(priceTargetRevision(pts(90, 5, 100, 10))!.direction, "lowering");
  strictEqual(priceTargetRevision(pts(101, 5, 100, 10))!.direction, "stable");
});

test("priceTargetRevision: null / missing windows → null or stable", () => {
  strictEqual(priceTargetRevision(null), null);
  strictEqual(priceTargetRevision(pts(null, 0, null, 0)), null);
  strictEqual(priceTargetRevision(pts(345, 3, null, 0))!.changePct, null);
});

test("earningsSurpriseHistory: missing estimate → null surprise, excluded from beat rate", () => {
  const h = earningsSurpriseHistory([earning("2026-04-30", 2.0, null)], 8);
  strictEqual(h.quarters[0].surprisePct, null);
  strictEqual(h.quarters[0].beat, null);
  strictEqual(h.beatRate, null);
});
