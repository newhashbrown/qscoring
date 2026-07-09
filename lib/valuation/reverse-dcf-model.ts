/**
 * Assemble the client-ready reverse-DCF model from raw FMP rows (Phase 2).
 *
 * Pure and testable: the server component fetches, this shapes, the client
 * component renders + re-solves. Returns null whenever a reverse DCF can't be
 * stated honestly (no FCF history, or a non-positive normalized base — you
 * cannot reverse-engineer an implied growth rate from negative cash flow).
 */
import type {
  CashFlowStatement,
  Profile,
  IncomeStatement,
  AnalystEstimate,
} from "@/lib/scoring/fmp";
import { normalizedBaseFcf, fcfCagr } from "./reverse-dcf";

/** Discount rate = cost of equity. Long-run US equity discount-rate midpoint. */
export const DEFAULT_COST_OF_EQUITY = 0.09;
/** Perpetual growth ≈ long-run nominal GDP; deliberately below the discount rate. */
export const DEFAULT_TERMINAL_GROWTH = 0.025;

export type DcfBaseline = {
  /** What the comparison rate represents; drives the label + honesty caveat. */
  kind: "consensus" | "historical" | "none";
  growth: number | null; // fraction, e.g. 0.08
  label: string;
};

export type ReverseDcfModel = {
  currency: string | null;
  /** Equity value the price implies (market cap). */
  marketCap: number;
  /** Normalized base-year FCF₀ fed to the solver. */
  baseFcf: number;
  /** Human label for how baseFcf was derived, e.g. "avg FY2022–FY2024". */
  baseFcfLabel: string;
  /** Most recent single-year FCF, shown alongside the normalized base. */
  latestFcf: number;
  defaultCostOfEquity: number;
  defaultTerminalGrowth: number;
  baseline: DcfBaseline;
};

type FcfYear = { fiscalYear: string; fcf: number };

/** Annual FCF rows → ascending [{fiscalYear, fcf}], dropping null/period≠FY. */
function annualFcfSeries(rows: CashFlowStatement[]): FcfYear[] {
  return rows
    .filter((r) => r.period === "FY" && r.freeCashFlow != null && Number.isFinite(r.freeCashFlow))
    .map((r) => ({ fiscalYear: r.fiscalYear, fcf: r.freeCashFlow as number }))
    .sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear));
}

/** Forward consensus revenue CAGR from analyst estimates, guarded; null if unusable. */
function consensusRevenueGrowth(estimates: AnalystEstimate[]): number | null {
  const revs = estimates
    .filter((e) => e.revenueAvg != null && Number.isFinite(e.revenueAvg))
    .map((e) => ({ date: e.date, rev: e.revenueAvg as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (revs.length < 2) return null;
  return fcfCagr(revs.map((r) => r.rev)); // same positive-endpoints guard applies
}

export function buildReverseDcfModel(inputs: {
  cashflow: CashFlowStatement[];
  profile: Profile[];
  income: IncomeStatement[];
  estimates: AnalystEstimate[];
}): ReverseDcfModel | null {
  // Currency-basis guard: FMP reports profile.marketCap in USD but statement
  // FCF in the filing currency. Equating them in the solve only holds when both
  // are USD — for a foreign filer (e.g. an ADR reporting in EUR/JPY) the implied
  // growth would be silently wrong. Hide the section rather than mislead; a
  // proper FX conversion is a future refinement.
  const currency = inputs.income[0]?.reportedCurrency ?? null;
  if (currency !== null && currency !== "USD") return null;

  const series = annualFcfSeries(inputs.cashflow);
  if (series.length < 2) return null; // need a couple of years to normalize + trend

  const fcfValues = series.map((y) => y.fcf);
  const baseFcf = normalizedBaseFcf(fcfValues, 3);
  if (baseFcf === null || !(baseFcf > 0)) return null; // negative FCF ⇒ no honest reverse DCF

  const marketCap = inputs.profile[0]?.marketCap;
  if (marketCap == null || !(marketCap > 0)) return null;

  const used = series.slice(-3);
  const baseFcfLabel =
    used.length === 1
      ? `FY${used[0].fiscalYear}`
      : `avg FY${used[0].fiscalYear}–FY${used[used.length - 1].fiscalYear}`;

  const consensus = consensusRevenueGrowth(inputs.estimates);
  const historical = fcfCagr(fcfValues);
  const baseline: DcfBaseline =
    consensus !== null
      ? { kind: "consensus", growth: consensus, label: "Analyst revenue growth (consensus)" }
      : historical !== null
        ? { kind: "historical", growth: historical, label: `Historical FCF growth (${series.length}-yr)` }
        : { kind: "none", growth: null, label: "No comparison available" };

  return {
    currency,
    marketCap,
    baseFcf,
    baseFcfLabel,
    latestFcf: series[series.length - 1].fcf,
    defaultCostOfEquity: DEFAULT_COST_OF_EQUITY,
    defaultTerminalGrowth: DEFAULT_TERMINAL_GROWTH,
    baseline,
  };
}
