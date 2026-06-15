/**
 * Tier 1b multi-year fundamentals trend.
 *
 * Pure functions — no FMP I/O. Takes already-fetched income + cash-flow
 * statement arrays and derives a year-by-year trend of ABSOLUTE revenue, EPS,
 * and free cash flow (each with a YoY %) plus gross/operating/net margins
 * (each with a YoY change in percentage points). Margins are computed from the
 * income-statement absolutes so every figure in a year ties out internally —
 * no separate /ratios call.
 *
 * Two integrity concerns are handled here, not in the view:
 *   - Sign changes (prior ≤ 0) make a relative YoY % meaningless → flagged
 *     `sign_change`; the view shows "n/m" rather than a nonsense percentage.
 *   - Large jumps off a thin base (the classic "FCF +800% off near-zero")
 *     are flagged `low_base` so the view can attach a distortion tooltip.
 *
 * The earnings staleness helper lives here too: it answers "is fresh data due
 * within N trading days" for the as-of stale flag the brief requires.
 */

import { isUsTradingDay } from "../market-date";
import type {
  CashFlowStatement,
  EarningsRow,
  IncomeStatement,
} from "./fmp";

// A relative YoY beyond this magnitude, off a base below the metric's
// low-base floor, is treated as a small-base distortion rather than signal.
const LOW_BASE_YOY_THRESHOLD = 2.0; // 200%
// FCF base is "thin" when it's below this fraction of the prior year's revenue.
const FCF_LOW_BASE_REVENUE_FRACTION = 0.02; // 2% of revenue
// EPS base is "thin" below this absolute (10 cents).
const EPS_LOW_BASE_FLOOR = 0.1;

export type Distortion = "sign_change" | "low_base" | null;

export type DollarMetricYear = {
  value: number | null; // absolute (USD, or EPS in currency units)
  yoyPct: number | null; // relative change as a fraction (0.12 = +12%)
  meaningful: boolean; // false → view shows "n/m" or "—" instead of yoyPct
  distortion: Distortion;
};

export type MarginYear = {
  value: number | null; // margin as a fraction (0.469 = 46.9%)
  yoyPoints: number | null; // change vs prior year, fraction (0.003 = +0.3pp)
};

export type FundamentalsYear = {
  fiscalYear: string;
  fiscalPeriodEnd: string; // statement `date` — the "as of" period end
  filingDate: string | null; // when it was filed — point-in-time integrity
  period: string; // "FY"
  revenue: DollarMetricYear;
  eps: DollarMetricYear;
  freeCashFlow: DollarMetricYear;
  grossMargin: MarginYear;
  operatingMargin: MarginYear;
  netMargin: MarginYear;
};

export type FundamentalsTrend = {
  currency: string | null;
  years: FundamentalsYear[]; // chronological ascending (oldest → newest)
};

function finite(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
}

function margin(numerator: number | null, revenue: number | null): number | null {
  const n = finite(numerator);
  const r = finite(revenue);
  if (n === null || r === null || r <= 0) return null;
  return n / r;
}

export function computeDollarYoY(
  value: number | null,
  prev: number | null,
  opts: { lowBaseFloor?: number } = {}
): DollarMetricYear {
  const v = finite(value);
  if (v === null) return { value: null, yoyPct: null, meaningful: false, distortion: null };

  const p = finite(prev);
  if (p === null) {
    // First year in the window — value is known, YoY is undefined ("—").
    return { value: v, yoyPct: null, meaningful: false, distortion: null };
  }
  if (p <= 0) {
    // A relative % off a zero/negative base is not meaningful ("n/m").
    return { value: v, yoyPct: null, meaningful: false, distortion: "sign_change" };
  }

  const yoyPct = (v - p) / p;
  const lowBase =
    opts.lowBaseFloor !== undefined &&
    Math.abs(p) < opts.lowBaseFloor &&
    Math.abs(yoyPct) > LOW_BASE_YOY_THRESHOLD;

  return { value: v, yoyPct, meaningful: true, distortion: lowBase ? "low_base" : null };
}

export function computeMarginYoY(value: number | null, prev: number | null): MarginYear {
  const v = finite(value);
  const p = finite(prev);
  return { value: v, yoyPoints: v !== null && p !== null ? v - p : null };
}

/**
 * Build the year-by-year trend from raw statement arrays (FMP order is
 * newest-first; we sort ascending internally so YoY compares to the true
 * prior fiscal year). Cash-flow rows are matched to income rows by
 * fiscalYear + period.
 */
export function buildFundamentalsTrend(
  income: readonly IncomeStatement[] | null | undefined,
  cashflow: readonly CashFlowStatement[] | null | undefined
): FundamentalsTrend {
  if (!income || income.length === 0) return { currency: null, years: [] };

  const rows = [...income].sort((a, b) => a.date.localeCompare(b.date));
  const fcfByKey = new Map<string, number | null>();
  for (const cf of cashflow ?? []) {
    fcfByKey.set(`${cf.fiscalYear}:${cf.period}`, finite(cf.freeCashFlow));
  }

  const epsOf = (r: IncomeStatement) => finite(r.epsDiluted) ?? finite(r.eps);
  const fcfOf = (r: IncomeStatement) =>
    fcfByKey.has(`${r.fiscalYear}:${r.period}`)
      ? fcfByKey.get(`${r.fiscalYear}:${r.period}`) ?? null
      : null;

  const years: FundamentalsYear[] = rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    const prevRevenue = prev ? finite(prev.revenue) : null;

    return {
      fiscalYear: r.fiscalYear,
      fiscalPeriodEnd: r.date,
      filingDate: r.filingDate ?? null,
      period: r.period,
      revenue: computeDollarYoY(finite(r.revenue), prev ? finite(prev.revenue) : null),
      eps: computeDollarYoY(epsOf(r), prev ? epsOf(prev) : null, {
        lowBaseFloor: EPS_LOW_BASE_FLOOR,
      }),
      freeCashFlow: computeDollarYoY(fcfOf(r), prev ? fcfOf(prev) : null, {
        lowBaseFloor:
          prevRevenue !== null
            ? Math.abs(prevRevenue) * FCF_LOW_BASE_REVENUE_FRACTION
            : undefined,
      }),
      grossMargin: computeMarginYoY(
        margin(r.grossProfit, r.revenue),
        prev ? margin(prev.grossProfit, prev.revenue) : null
      ),
      operatingMargin: computeMarginYoY(
        margin(r.operatingIncome, r.revenue),
        prev ? margin(prev.operatingIncome, prev.revenue) : null
      ),
      netMargin: computeMarginYoY(
        margin(r.netIncome, r.revenue),
        prev ? margin(prev.netIncome, prev.revenue) : null
      ),
    };
  });

  return { currency: rows[0]?.reportedCurrency ?? null, years };
}

// One as-reported filing's raw facts — the unit the filing-keyed store
// persists (append-only, dedup on ticker+fiscalPeriodEnd+filingDate). Distinct
// from FundamentalsYear, which carries display-oriented YoY derivations.
export type FundamentalFact = {
  fiscalPeriodEnd: string;
  filingDate: string; // required — a fact with no filing date has no point-in-time anchor
  fiscalYear: string;
  period: string;
  reportedCurrency: string | null;
  revenue: number | null;
  epsDiluted: number | null;
  freeCashFlow: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
};

/**
 * Flatten statement arrays into per-filing facts for the store. Rows without a
 * filingDate are dropped — without it there's no point-in-time anchor, which
 * is the whole reason the store exists. Margins are derived from the income
 * absolutes so a stored row ties out internally.
 */
export function extractFundamentalFacts(
  income: readonly IncomeStatement[] | null | undefined,
  cashflow: readonly CashFlowStatement[] | null | undefined
): FundamentalFact[] {
  if (!income || income.length === 0) return [];
  const fcfByKey = new Map<string, number | null>();
  for (const cf of cashflow ?? []) {
    fcfByKey.set(`${cf.fiscalYear}:${cf.period}`, finite(cf.freeCashFlow));
  }

  const facts: FundamentalFact[] = [];
  for (const r of income) {
    if (!r.filingDate) continue; // no anchor → not storable
    facts.push({
      fiscalPeriodEnd: r.date,
      filingDate: r.filingDate,
      fiscalYear: r.fiscalYear,
      period: r.period,
      reportedCurrency: r.reportedCurrency ?? null,
      revenue: finite(r.revenue),
      epsDiluted: finite(r.epsDiluted) ?? finite(r.eps),
      freeCashFlow: fcfByKey.get(`${r.fiscalYear}:${r.period}`) ?? null,
      grossMargin: margin(r.grossProfit, r.revenue),
      operatingMargin: margin(r.operatingIncome, r.revenue),
      netMargin: margin(r.netIncome, r.revenue),
    });
  }
  return facts;
}

export type EarningsStale = {
  nextEarningsDate: string | null;
  tradingDaysAway: number | null;
  stale: boolean;
};

// Count trading days in (from, target]. Anchored at 12:00 UTC so the ET
// weekday of each cursor lands on the intended calendar day (midnight-UTC
// would read as the previous ET evening and miscount weekends).
function countTradingDays(from: Date, targetYmd: string): number {
  const target = new Date(`${targetYmd}T12:00:00Z`);
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12)
  );
  let count = 0;
  let guard = 0;
  while (cursor < target && guard < 750) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isUsTradingDay(cursor)) count += 1;
    guard += 1;
  }
  return count;
}

/**
 * Stale-data flag: true when the next scheduled earnings report (a future
 * row with no actual yet) falls within `maxTradingDays` trading days — i.e.
 * the displayed fundamentals are about to be superseded.
 */
export function nextEarningsStaleFlag(
  earnings: readonly EarningsRow[] | null | undefined,
  now: Date = new Date(),
  maxTradingDays = 5
): EarningsStale {
  if (!earnings || earnings.length === 0) {
    return { nextEarningsDate: null, tradingDaysAway: null, stale: false };
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);

  const upcoming = earnings
    .filter((e) => typeof e.date === "string" && e.date >= today && e.epsActual === null)
    .map((e) => e.date)
    .sort();

  const nextEarningsDate = upcoming[0] ?? null;
  if (!nextEarningsDate) {
    return { nextEarningsDate: null, tradingDaysAway: null, stale: false };
  }
  const tradingDaysAway = countTradingDays(now, nextEarningsDate);
  return {
    nextEarningsDate,
    tradingDaysAway,
    stale: tradingDaysAway <= maxTradingDays,
  };
}
