import { fmp, type FinancialGrowth, type KeyMetricsTtm, type PricePoint, type Profile, type Quote, type RatiosTtm, type SharesFloat } from "./fmp";
import { withStalenessTracking } from "./fmp-cache";
import { buildCompanyHeader } from "./company-header";
import { attachRelativeContext } from "./relative";
import { return1mo, return3mo, return12mo, rsi14, realizedVolatility, maCrossover } from "./momentum";
import { settledCloseFromHistory } from "../snapshot-price";
import { classifyCoverage } from "../coverage";
import { getStats, scoreHigher, scoreLower, scoreBeta, scoreRsi, scoreMaCross } from "./zscore";
import type {
  CategoryScore,
  Confidence,
  MetricScore,
  ScoreResult,
  Signal,
} from "./types";
// Phase-2 factor experiments — gated, default OFF (see lib/feature-flags.ts).
import {
  MOMENTUM_V2_ENABLED,
  RISK_EWMA_VOL_ENABLED,
  RISK_BETA_VARIANT,
} from "../feature-flags";
import { volScaledMomentum12_1, scoreVolScaledMomentum } from "./momentum-factor";
import { ewmaVolatility, scoreBetaLowAbs, scoreBetaNeutral } from "./risk-factor";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

// Long-horizon weights: lean fundamentals (value + growth + profitability).
const W_LONG = {
  value: 0.3,
  growth: 0.2,
  profitability: 0.25,
  momentum: 0.05,
  risk: 0.2,
} as const;

// Short-horizon weights: lean momentum and risk; fundamentals matter less.
const W_SHORT = {
  value: 0.1,
  growth: 0.15,
  profitability: 0.1,
  momentum: 0.4,
  risk: 0.25,
} as const;

export type FetchedTickerData = {
  profile: Profile;
  quote?: Quote;
  ratios?: RatiosTtm;
  km?: KeyMetricsTtm;
  growth?: FinancialGrowth;
  sharesFloat?: SharesFloat;
  history: PricePoint[];
};

function aggregate(metrics: MetricScore[]): { score: number; completeness: number } {
  const scored = metrics.filter(
    (m): m is MetricScore & { score: number } => m.score !== null && Number.isFinite(m.score)
  );
  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
  if (scored.length === 0) return { score: 50, completeness: 0 };
  let weightSum = 0;
  let scoreSum = 0;
  for (const m of scored) {
    weightSum += m.weight;
    scoreSum += m.weight * m.score;
  }
  // Weighted completeness: the fraction of the category's total weight that
  // returned a real score. Count-based completeness used to misreport when a
  // high-weight metric (e.g. Revenue Growth at 1.5) was missing alongside a
  // low-weight one (e.g. FCF Growth at 1.0) — both counted as "1 missing"
  // even though effective coverage was much lower. deriveConfidence reads
  // this to gate HIGH-confidence labels.
  return {
    score: scoreSum / weightSum,
    completeness: totalWeight > 0 ? weightSum / totalWeight : 0,
  };
}

function deriveSignal(longScore: number, shortScore: number, momentum: number): Signal {
  // Round before comparing so the threshold checks here line up exactly with
  // the integer values the UI shows. Without this, a raw 59.6 displays as 60
  // but fails the `>= 60` check — which looked like a bug to anyone reading
  // both the methodology and the score page side by side.
  const lt = Math.round(longScore);
  const st = Math.round(shortScore);
  const mom = Math.round(momentum);

  if (lt < 30 || st < 30) return "SHORT";
  if (st >= 65 && mom >= 60) return "BUY_SHORT_TERM";
  if (lt >= 70) return "BUY_LONG_TERM";
  if (lt >= 60 && lt > st) return "BUY_LONG_TERM";
  if (st >= 60 && st > lt) return "BUY_SHORT_TERM";
  return "HOLD";
}

function deriveConfidence(avgCompleteness: number, composite: number): Confidence {
  if (avgCompleteness < 0.6) return "LOW";
  // High confidence when data is complete AND the score is decisive (clearly buy/short, not in the muddy middle)
  const decisive = composite >= 70 || composite <= 30;
  if (avgCompleteness >= 0.85 && decisive) return "HIGH";
  if (avgCompleteness >= 0.75) return "MEDIUM";
  return "LOW";
}

export function validateTicker(input: string): string {
  const cleaned = input.trim().toUpperCase();
  if (!TICKER_RE.test(cleaned)) {
    throw new Error(`Invalid ticker: "${input}"`);
  }
  return cleaned;
}

/**
 * Fetch all the FMP data needed to score a ticker. Each underlying call goes
 * through Next.js fetch cache (15-minute TTL) so repeated calls within the
 * window are free. Throws if the company profile is missing.
 */
export async function fetchTickerData(rawTicker: string): Promise<FetchedTickerData> {
  const ticker = validateTicker(rawTicker);
  const [profileR, quoteR, ratiosR, kmR, growthR, sharesFloatR, historyR] = await Promise.all([
    fmp.profile(ticker),
    fmp.quote(ticker),
    fmp.ratiosTtm(ticker),
    fmp.keyMetricsTtm(ticker),
    fmp.financialGrowth(ticker).catch(() => [] as FinancialGrowth[]),
    // Header-only context; a failure here must not block the score.
    fmp.sharesFloat(ticker).catch(() => [] as SharesFloat[]),
    fmp.historical(ticker).catch(() => [] as PricePoint[]),
  ]);
  const profile = profileR[0];
  if (!profile) throw new Error(`No profile data found for ${ticker}`);
  return {
    profile,
    quote: quoteR[0],
    ratios: ratiosR[0],
    km: kmR[0],
    growth: growthR[0],
    sharesFloat: sharesFloatR[0],
    history: historyR ?? [],
  };
}

/**
 * Compute a score from already-fetched ticker data. Splitting this out from
 * fetchTickerData lets callers run the scoring math twice — once with the
 * full price history and once with `historyOffset: 1` to get yesterday's
 * snapshot — without hitting FMP twice.
 */
export function scoreFromFetched(
  rawTicker: string,
  data: FetchedTickerData,
  opts: { historyOffset?: number } = {}
): ScoreResult {
  const ticker = validateTicker(rawTicker);
  const offset = opts.historyOffset ?? 0;
  const history = data.history.slice(offset);

  const { profile, quote, ratios, km, growth, sharesFloat } = data;
  const sector = profile.sector || null;
  const stat = (key: Parameters<typeof getStats>[0]) => getStats(key, sector);

  // ─── VALUE ─────────────────────────────────────────────────
  const valueMetrics: MetricScore[] = [
    {
      name: "P/E",
      raw: ratios?.priceToEarningsRatioTTM ?? null,
      score: scoreLower(ratios?.priceToEarningsRatioTTM, stat("pe"), { negativeIsBad: true, negativeScore: 8 }),
      weight: 1.2,
      format: "ratio",
    },
    {
      name: "P/B",
      raw: ratios?.priceToBookRatioTTM ?? null,
      score: scoreLower(ratios?.priceToBookRatioTTM, stat("pb"), { negativeIsBad: true, negativeScore: 5 }),
      weight: 1,
      format: "ratio",
    },
    {
      name: "P/S",
      raw: ratios?.priceToSalesRatioTTM ?? null,
      score: scoreLower(ratios?.priceToSalesRatioTTM, stat("ps")),
      weight: 1,
      format: "ratio",
    },
    {
      name: "EV/EBITDA",
      raw: km?.evToEBITDATTM ?? null,
      score: scoreLower(km?.evToEBITDATTM, stat("evEbitda"), { negativeIsBad: true, negativeScore: 5 }),
      weight: 1.2,
      format: "ratio",
    },
  ];

  // ─── GROWTH ────────────────────────────────────────────────
  const growthMetrics: MetricScore[] = [
    {
      name: "Revenue Growth",
      raw: growth?.revenueGrowth ?? null,
      score: scoreHigher(growth?.revenueGrowth, stat("revenueGrowth")),
      weight: 1.5,
      format: "percent",
    },
    {
      name: "EPS Growth",
      raw: growth?.epsgrowth ?? null,
      score: scoreHigher(growth?.epsgrowth, stat("epsGrowth")),
      weight: 1.5,
      format: "percent",
    },
    {
      name: "FCF Growth",
      raw: growth?.freeCashFlowGrowth ?? null,
      score: scoreHigher(growth?.freeCashFlowGrowth, stat("fcfGrowth")),
      weight: 1,
      format: "percent",
    },
  ];

  // ─── MOMENTUM ──────────────────────────────────────────────
  const r12 = return12mo(history);
  const r3 = return3mo(history);
  const r1 = return1mo(history);
  const rsi = rsi14(history);
  const goldenCross = maCrossover(quote?.priceAvg50 ?? null, quote?.priceAvg200 ?? null);

  const legacyMomentumMetrics: MetricScore[] = [
    {
      name: "12-Month Return",
      raw: r12,
      score: scoreHigher(r12, stat("return12mo")),
      weight: 1.5,
      format: "percent",
    },
    {
      name: "3-Month Return",
      raw: r3,
      score: scoreHigher(r3, stat("return3mo")),
      weight: 1.2,
      format: "percent",
    },
    {
      name: "1-Month Return",
      raw: r1,
      score: scoreHigher(r1, stat("return1mo")),
      weight: 1,
      format: "percent",
    },
    { name: "RSI (14)", raw: rsi, score: scoreRsi(rsi), weight: 1, format: "number" },
    {
      name: "50/200 MA",
      raw: goldenCross === null ? null : goldenCross ? 1 : 0,
      score: scoreMaCross(goldenCross),
      weight: 1,
      format: "number",
    },
  ];

  // MOMENTUM_V2 (Phase-2 Agent A): swap the legacy sub-components for the
  // volatility-scaled 12-1 factor. Default OFF → legacy momentum unchanged.
  const momentumMetrics: MetricScore[] = MOMENTUM_V2_ENABLED
    ? [
        {
          name: "12-1 Vol-Scaled Momentum",
          raw: volScaledMomentum12_1(history),
          score: scoreVolScaledMomentum(history, sector),
          weight: 1,
          format: "number",
        },
      ]
    : legacyMomentumMetrics;

  // ─── PROFITABILITY ─────────────────────────────────────────
  const profMetrics: MetricScore[] = [
    {
      name: "ROE",
      raw: km?.returnOnEquityTTM ?? null,
      score: scoreHigher(km?.returnOnEquityTTM, stat("roe")),
      weight: 1.5,
      format: "percent",
    },
    {
      name: "ROA",
      raw: km?.returnOnAssetsTTM ?? null,
      score: scoreHigher(km?.returnOnAssetsTTM, stat("roa")),
      weight: 1,
      format: "percent",
    },
    {
      name: "Gross Margin",
      raw: ratios?.grossProfitMarginTTM ?? null,
      score: scoreHigher(ratios?.grossProfitMarginTTM, stat("grossMargin")),
      weight: 1,
      format: "percent",
    },
    {
      name: "Operating Margin",
      raw: ratios?.operatingProfitMarginTTM ?? null,
      score: scoreHigher(ratios?.operatingProfitMarginTTM, stat("operatingMargin")),
      weight: 1.2,
      format: "percent",
    },
    {
      name: "Net Margin",
      raw: ratios?.netProfitMarginTTM ?? null,
      score: scoreHigher(ratios?.netProfitMarginTTM, stat("netMargin")),
      weight: 1,
      format: "percent",
    },
    {
      name: "FCF Yield",
      raw: km?.freeCashFlowYieldTTM ?? null,
      score: scoreHigher(km?.freeCashFlowYieldTTM, stat("fcfYield")),
      weight: 1.2,
      format: "percent",
    },
  ];

  // ─── RISK ──────────────────────────────────────────────────
  // RISK_EWMA_VOL (Agent B): EWMA vol vs equal-weight realized vol. Default OFF.
  // NOTE: vol is z-scored against stat("vol60"), which is the equal-weight
  // distribution; if EWMA is enabled in production, the universe-stats job must
  // also emit an EWMA vol distribution (Agent B to flag in their report).
  const vol = RISK_EWMA_VOL_ENABLED ? ewmaVolatility(history) : realizedVolatility(history);

  // RISK_BETA_VARIANT (Agent B): default piecewise / low-|beta| / neutral. Default = current.
  const betaScore =
    RISK_BETA_VARIANT === "low_abs"
      ? scoreBetaLowAbs(profile.beta)
      : RISK_BETA_VARIANT === "neutral"
        ? scoreBetaNeutral(profile.beta)
        : scoreBeta(profile.beta);

  const riskMetrics: MetricScore[] = [
    {
      name: "Beta",
      raw: profile.beta ?? null,
      score: betaScore,
      weight: 1,
      format: "number",
    },
    {
      name: "60-Day Volatility",
      raw: vol,
      score: scoreLower(vol, stat("vol60")),
      weight: 1.2,
      format: "percent",
    },
  ];

  const sections = [
    { name: "value" as const, label: "Value", metrics: valueMetrics },
    { name: "growth" as const, label: "Growth", metrics: growthMetrics },
    { name: "momentum" as const, label: "Momentum", metrics: momentumMetrics },
    { name: "profitability" as const, label: "Profitability", metrics: profMetrics },
    { name: "risk" as const, label: "Risk", metrics: riskMetrics },
  ];

  const categories: CategoryScore[] = sections.map((s) => {
    const { score, completeness } = aggregate(s.metrics);
    return {
      name: s.name,
      label: s.label,
      score,
      weightLong: W_LONG[s.name],
      weightShort: W_SHORT[s.name],
      metrics: s.metrics,
      completeness,
    };
  });

  let longTerm = 0;
  let shortTerm = 0;
  for (const c of categories) {
    longTerm += c.score * c.weightLong;
    shortTerm += c.score * c.weightShort;
  }
  const composite = (longTerm + shortTerm) / 2;

  const momentumCategory = categories.find((c) => c.name === "momentum")!;
  const signal = deriveSignal(longTerm, shortTerm, momentumCategory.score);

  const avgCompleteness =
    categories.reduce((s, c) => s + c.completeness, 0) / categories.length;
  const confidence = deriveConfidence(avgCompleteness, composite);

  // Where this name sits vs the reference universe (badge on every score page).
  const coverage = classifyCoverage({
    isEtf: profile.isEtf,
    isFund: profile.isFund,
    isActivelyTrading: profile.isActivelyTrading,
    sector: profile.sector,
    industry: profile.industry,
    marketCap: profile.marketCap,
    confidence,
  });

  // ─── TIER 1a HEADER ────────────────────────────────────────
  // Point-in-time company facts. marketCap/range/avgVolume come from the
  // /profile payload, dividend yield from ratios-ttm, shares + float from
  // /shares-float. All fields degrade to null on missing coverage.
  const header = buildCompanyHeader({
    marketCap: profile.marketCap,
    sharesOutstanding: sharesFloat?.outstandingShares,
    floatShares: sharesFloat?.floatShares,
    freeFloatPercent: sharesFloat?.freeFloat,
    dividendYield: ratios?.dividendYieldTTM,
    range52Week: profile.range,
    history,
  });

  // Settled EOD close for the snapshot ledger, from the (offset-adjusted)
  // history so the "yesterday's snapshot" path stays internally consistent.
  // `price`/`changePercent` below remain live (/quote) for the /score page.
  const settled = settledCloseFromHistory(history);

  return {
    ticker,
    companyName: profile.companyName,
    sector: profile.sector || null,
    industry: profile.industry || null,
    price: quote?.price ?? profile.price,
    changePercent: quote?.changePercentage ?? profile.changePercentage ?? 0,
    settledClose: settled.close,
    settledChangePercent: settled.changePercent,
    settledCloseDate: settled.date,
    composite: Math.round(composite),
    signal,
    confidence,
    coverage,
    longTermScore: Math.round(longTerm),
    shortTermScore: Math.round(shortTerm),
    // Attach sector/universe percentile context for the relative-context tier.
    // Scoring math above used the bare categories; this is presentation-only.
    categories: attachRelativeContext(categories, sector),
    header,
    generatedAt: new Date().toISOString(),
  };
}

export async function scoreTicker(rawTicker: string): Promise<ScoreResult> {
  const { result, oldestStaleAt } = await withStalenessTracking(async () => {
    const data = await fetchTickerData(rawTicker);
    return scoreFromFetched(rawTicker, data);
  });
  return { ...result, staleSince: oldestStaleAt };
}
