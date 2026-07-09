import { test } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import { buildReverseDcfModel } from "./reverse-dcf-model";
import type {
  CashFlowStatement,
  Profile,
  IncomeStatement,
  AnalystEstimate,
} from "@/lib/scoring/fmp";

function cf(fiscalYear: string, freeCashFlow: number | null): CashFlowStatement {
  return {
    date: `${fiscalYear}-12-31`,
    filingDate: null,
    fiscalYear,
    period: "FY",
    freeCashFlow,
    netStockIssuance: null,
    commonStockRepurchased: null,
    commonDividendsPaid: null,
  };
}
const profile = (marketCap: number): Profile[] =>
  [{ marketCap } as Profile];
const income = (reportedCurrency: string | null): IncomeStatement[] =>
  [{ reportedCurrency } as IncomeStatement];
const est = (date: string, revenueAvg: number | null): AnalystEstimate =>
  ({ symbol: "T", date, revenueAvg, epsAvg: null, netIncomeAvg: null });

// FMP returns newest-first; the builder must sort ascending and normalize.
const NEWEST_FIRST = [cf("2024", 4000), cf("2023", 3000), cf("2022", 2000), cf("2021", 1500), cf("2020", 1000)];

test("buildReverseDcfModel: shapes a full model with normalized base + latest FCF", () => {
  const m = buildReverseDcfModel({
    cashflow: NEWEST_FIRST,
    profile: profile(80_000),
    income: income("USD"),
    estimates: [],
  });
  ok(m !== null);
  strictEqual(m!.currency, "USD");
  strictEqual(m!.marketCap, 80_000);
  strictEqual(m!.latestFcf, 4000); // most recent year, after ascending sort
  strictEqual(m!.baseFcf, (2000 + 3000 + 4000) / 3); // last 3 of the ascending series
  strictEqual(m!.baseFcfLabel, "avg FY2022–FY2024");
});

test("buildReverseDcfModel: prefers analyst consensus baseline when estimates present", () => {
  const m = buildReverseDcfModel({
    cashflow: NEWEST_FIRST,
    profile: profile(80_000),
    income: income("USD"),
    estimates: [est("2026-12-31", 5000), est("2027-12-31", 5500), est("2028-12-31", 6000)],
  });
  strictEqual(m!.baseline.kind, "consensus");
  ok(m!.baseline.growth !== null && m!.baseline.growth > 0);
});

test("buildReverseDcfModel: falls back to historical FCF growth when no estimates", () => {
  const m = buildReverseDcfModel({
    cashflow: NEWEST_FIRST,
    profile: profile(80_000),
    income: income("USD"),
    estimates: [],
  });
  strictEqual(m!.baseline.kind, "historical");
  ok(m!.baseline.growth !== null && m!.baseline.growth > 0);
});

test("buildReverseDcfModel: null when the normalized base FCF is negative", () => {
  const negative = [cf("2024", -500), cf("2023", -400), cf("2022", -300), cf("2021", 100)];
  const m = buildReverseDcfModel({
    cashflow: negative,
    profile: profile(80_000),
    income: income("USD"),
    estimates: [],
  });
  strictEqual(m, null);
});

test("buildReverseDcfModel: null when there's under two years of FCF", () => {
  const m = buildReverseDcfModel({
    cashflow: [cf("2024", 4000)],
    profile: profile(80_000),
    income: income("USD"),
    estimates: [],
  });
  strictEqual(m, null);
});

test("buildReverseDcfModel: null when market cap is missing", () => {
  const m = buildReverseDcfModel({
    cashflow: NEWEST_FIRST,
    profile: [],
    income: income("USD"),
    estimates: [],
  });
  strictEqual(m, null);
});
