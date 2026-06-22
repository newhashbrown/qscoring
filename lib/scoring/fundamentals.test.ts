import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  computeDollarYoY,
  computeMarginYoY,
  buildFundamentalsTrend,
  nextEarningsStaleFlag,
  extractFundamentalFacts,
  factIssues,
  partitionFacts,
  type FundamentalFact,
} from "./fundamentals";
import type { CashFlowStatement, EarningsRow, IncomeStatement } from "./fmp";

function fixture<T>(name: string): T {
  const url = new URL(`./__fixtures__/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf-8")) as T;
}

const approx = (a: number | null, b: number, eps = 1e-9) =>
  a !== null && Math.abs(a - b) < eps;

// ─── computeDollarYoY ────────────────────────────────────────
test("computeDollarYoY: normal positive base → relative change, meaningful", () => {
  const r = computeDollarYoY(120, 100);
  strictEqual(approx(r.yoyPct, 0.2), true);
  strictEqual(r.meaningful, true);
  strictEqual(r.distortion, null);
});

test("computeDollarYoY: first year (no prior) → value kept, YoY undefined", () => {
  const r = computeDollarYoY(100, null);
  strictEqual(r.value, 100);
  strictEqual(r.yoyPct, null);
  strictEqual(r.meaningful, false);
  strictEqual(r.distortion, null);
});

test("computeDollarYoY: prior ≤ 0 → sign_change, not a nonsense %", () => {
  const fromNeg = computeDollarYoY(50, -10);
  strictEqual(fromNeg.yoyPct, null);
  strictEqual(fromNeg.meaningful, false);
  strictEqual(fromNeg.distortion, "sign_change");

  const fromZero = computeDollarYoY(50, 0);
  strictEqual(fromZero.distortion, "sign_change");
});

test("computeDollarYoY: >200% off a thin base → low_base distortion", () => {
  const r = computeDollarYoY(300, 5, { lowBaseFloor: 24 });
  strictEqual(approx(r.yoyPct, (300 - 5) / 5), true);
  strictEqual(r.meaningful, true);
  strictEqual(r.distortion, "low_base");
});

test("computeDollarYoY: big jump on a healthy base is NOT flagged", () => {
  // 95 → 300 is +215% but the base (95) clears the floor (24): real growth.
  const r = computeDollarYoY(300, 95, { lowBaseFloor: 24 });
  strictEqual(r.distortion, null);
  strictEqual(r.meaningful, true);
});

test("computeDollarYoY: null current → empty cell", () => {
  const r = computeDollarYoY(null, 100);
  strictEqual(r.value, null);
  strictEqual(r.meaningful, false);
});

// ─── computeMarginYoY ────────────────────────────────────────
test("computeMarginYoY: percentage-point delta vs prior", () => {
  const r = computeMarginYoY(0.42, 0.4);
  strictEqual(approx(r.value, 0.42), true);
  strictEqual(approx(r.yoyPoints!, 0.02), true);
});

test("computeMarginYoY: no prior → null delta", () => {
  strictEqual(computeMarginYoY(0.42, null).yoyPoints, null);
});

// ─── buildFundamentalsTrend (fixture-backed) ─────────────────
test("buildFundamentalsTrend: assembles ascending years with YoY + margins", () => {
  const income = fixture<IncomeStatement[]>("income-statement-3y.json");
  const cashflow = fixture<CashFlowStatement[]>("cash-flow-3y.json");
  const trend = buildFundamentalsTrend(income, cashflow);

  strictEqual(trend.currency, "USD");
  strictEqual(trend.years.length, 3);
  // Sorted oldest → newest regardless of FMP's newest-first input order.
  deepStrictEqual(
    trend.years.map((y) => y.fiscalYear),
    ["2023", "2024", "2025"]
  );

  const y2025 = trend.years[2];
  strictEqual(y2025.fiscalPeriodEnd, "2025-12-31");
  strictEqual(y2025.filingDate, "2026-02-10"); // as-of integrity preserved
  strictEqual(y2025.revenue.value, 1500);
  strictEqual(approx(y2025.revenue.yoyPct, (1500 - 1200) / 1200), true); // +25%
  strictEqual(y2025.eps.value, 1.5); // diluted preferred
  strictEqual(approx(y2025.grossMargin.value, 660 / 1500), true); // 44%
  strictEqual(approx(y2025.grossMargin.yoyPoints!, 660 / 1500 - 504 / 1200), true);

  // FCF 95 → 300 is +215% but on a base (95) that clears 2% of prior revenue
  // (0.02 × 1200 = 24): real growth, NOT a low-base distortion.
  strictEqual(y2025.freeCashFlow.distortion, null);

  // First year carries values but no YoY.
  strictEqual(trend.years[0].revenue.yoyPct, null);
  strictEqual(trend.years[0].revenue.meaningful, false);
});

test("buildFundamentalsTrend: empty income → empty trend, no throw", () => {
  const trend = buildFundamentalsTrend([], []);
  strictEqual(trend.years.length, 0);
  strictEqual(trend.currency, null);
});

// ─── extractFundamentalFacts (store rows) ────────────────────
test("extractFundamentalFacts: one row per filing with derived margins", () => {
  const income = fixture<IncomeStatement[]>("income-statement-3y.json");
  const cashflow = fixture<CashFlowStatement[]>("cash-flow-3y.json");
  const facts = extractFundamentalFacts(income, cashflow);

  strictEqual(facts.length, 3);
  const f2025 = facts.find((f) => f.fiscalYear === "2025")!;
  strictEqual(f2025.fiscalPeriodEnd, "2025-12-31");
  strictEqual(f2025.filingDate, "2026-02-10");
  strictEqual(f2025.revenue, 1500);
  strictEqual(f2025.epsDiluted, 1.5);
  strictEqual(f2025.freeCashFlow, 300);
  strictEqual(approx(f2025.grossMargin, 660 / 1500), true);
  strictEqual(approx(f2025.netMargin, 180 / 1500), true);
});

test("extractFundamentalFacts: drops rows lacking a filingDate (no anchor)", () => {
  const income: IncomeStatement[] = [
    {
      date: "2025-12-31", filingDate: null, acceptedDate: null, fiscalYear: "2025",
      period: "FY", reportedCurrency: "USD", revenue: 100, grossProfit: 40,
      operatingIncome: 20, netIncome: 10, eps: 1, epsDiluted: 1,
    },
  ];
  strictEqual(extractFundamentalFacts(income, []).length, 0);
});

// ─── completeness gate (partitionFacts / factIssues) ────────
function completeFact(over: Partial<FundamentalFact> = {}): FundamentalFact {
  return {
    fiscalPeriodEnd: "2025-12-31",
    filingDate: "2026-02-10",
    fiscalYear: "2025",
    period: "FY",
    reportedCurrency: "USD",
    revenue: 1500,
    epsDiluted: 1.5,
    freeCashFlow: 300,
    grossMargin: 0.44,
    operatingMargin: 0.22,
    netMargin: 0.12,
    ...over,
  };
}

test("partitionFacts (a): one required field null → skipped, not written, with reason", () => {
  const { complete, skipped } = partitionFacts([completeFact({ freeCashFlow: null })]);
  strictEqual(complete.length, 0);
  strictEqual(skipped.length, 1);
  strictEqual(skipped[0].missing.includes("freeCashFlow"), true);
  strictEqual(skipped[0].filingDate, "2026-02-10"); // structured warning has the anchor
});

test("partitionFacts (b): complete payload → written, no skips", () => {
  const { complete, skipped } = partitionFacts([completeFact()]);
  strictEqual(complete.length, 1);
  strictEqual(skipped.length, 0);
  strictEqual(factIssues(completeFact()).length, 0);
});

test("partitionFacts (c): complete then partial for same key → partial skipped, original survives", () => {
  // Same (fiscalPeriodEnd, filingDate) key; second arrives with a null margin.
  const { complete, skipped } = partitionFacts([
    completeFact(),
    completeFact({ netMargin: null }),
  ]);
  // Only the complete row reaches the writer; the partial never attempts an
  // INSERT, so (combined with ON CONFLICT DO NOTHING) the original is unchanged.
  strictEqual(complete.length, 1);
  strictEqual(complete[0].netMargin, 0.12);
  strictEqual(skipped.length, 1);
  strictEqual(skipped[0].missing.includes("netMargin"), true);
});

test("factIssues: flags malformed dates and bad period", () => {
  const issues = factIssues(completeFact({ filingDate: "nope", period: "H1" }));
  strictEqual(issues.includes("filingDate"), true);
  strictEqual(issues.includes("period"), true);
});

// ─── nextEarningsStaleFlag ───────────────────────────────────
// Anchor: Monday 2026-06-15 (deterministic so weekday math is stable).
const MON = new Date("2026-06-15T12:00:00Z");

function earning(date: string, epsActual: number | null): EarningsRow {
  return { symbol: "X", date, epsActual, epsEstimated: 1, revenueActual: null, revenueEstimated: 1 };
}

test("nextEarningsStaleFlag: next report within 5 trading days → stale", () => {
  // Thu 2026-06-18 is 3 trading days out from Mon 06-15.
  const r = nextEarningsStaleFlag([earning("2026-06-18", null)], MON, 5);
  strictEqual(r.nextEarningsDate, "2026-06-18");
  strictEqual(r.tradingDaysAway, 3);
  strictEqual(r.stale, true);
});

test("nextEarningsStaleFlag: report 9 trading days out (Juneteenth excluded) → not stale", () => {
  // Mon 06-15 → Mon 06-29 spans 10 weekdays but Fri 06-19 is Juneteenth, so
  // countTradingDays (holiday-aware via isUsTradingDay, issue #48) returns 9.
  const r = nextEarningsStaleFlag([earning("2026-06-29", null)], MON, 5);
  strictEqual(r.tradingDaysAway, 9);
  strictEqual(r.stale, false);
});

test("nextEarningsStaleFlag: only past/reported rows → no upcoming, not stale", () => {
  const r = nextEarningsStaleFlag(
    [earning("2026-04-30", 2.01), earning("2026-01-30", 1.9)],
    MON,
    5
  );
  strictEqual(r.nextEarningsDate, null);
  strictEqual(r.stale, false);
});

test("nextEarningsStaleFlag: empty earnings → not stale", () => {
  strictEqual(nextEarningsStaleFlag([], MON).stale, false);
});
