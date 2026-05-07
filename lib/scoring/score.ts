import { fmp } from "./fmp";
import { return1mo, return3mo, return12mo, rsi14, realizedVolatility, maCrossover } from "./momentum";
import { getStats, scoreHigher, scoreLower, scoreBeta, scoreRsi, scoreMaCross } from "./zscore";
import type {
  CategoryScore,
  Confidence,
  MetricScore,
  ScoreResult,
  Signal,
} from "./types";

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

function aggregate(metrics: MetricScore[]): { score: number; completeness: number } {
  const scored = metrics.filter(
    (m): m is MetricScore & { score: number } => m.score !== null && Number.isFinite(m.score)
  );
  if (scored.length === 0) return { score: 50, completeness: 0 };
  let weightSum = 0;
  let scoreSum = 0;
  for (const m of scored) {
    weightSum += m.weight;
    scoreSum += m.weight * m.score;
  }
  return { score: scoreSum / weightSum, completeness: scored.length / metrics.length };
}

function deriveSignal(longScore: number, shortScore: number, momentum: number): Signal {
  if (longScore < 30 || shortScore < 30) return "SHORT";
  if (shortScore >= 65 && momentum >= 60) return "BUY_SHORT_TERM";
  if (longScore >= 70) return "BUY_LONG_TERM";
  if (longScore >= 60 && longScore > shortScore) return "BUY_LONG_TERM";
  if (shortScore >= 60 && shortScore > longScore) return "BUY_SHORT_TERM";
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

export async function scoreTicker(rawTicker: string): Promise<ScoreResult> {
  const ticker = validateTicker(rawTicker);

  const [profileR, quoteR, ratiosR, kmR, growthR, historyR] = await Promise.all([
    fmp.profile(ticker),
    fmp.quote(ticker),
    fmp.ratiosTtm(ticker),
    fmp.keyMetricsTtm(ticker),
    fmp.financialGrowth(ticker).catch(() => [] as never),
    fmp.historical(ticker).catch(() => [] as never),
  ]);

  const profile = profileR[0];
  if (!profile) throw new Error(`No profile data found for ${ticker}`);

  const quote = quoteR[0];
  const ratios = ratiosR[0];
  const km = kmR[0];
  const growth = growthR[0];
  const history = historyR ?? [];
  const sector = profile.sector || null;

  // Helper: build a metric entry given key, raw value, and the scoring fn applied to its sector stats.
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

  const momentumMetrics: MetricScore[] = [
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
  const vol = realizedVolatility(history);

  const riskMetrics: MetricScore[] = [
    {
      name: "Beta",
      raw: profile.beta ?? null,
      score: scoreBeta(profile.beta, stat("beta")),
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

  return {
    ticker,
    companyName: profile.companyName,
    sector: profile.sector || null,
    industry: profile.industry || null,
    price: quote?.price ?? profile.price,
    changePercent: quote?.changePercentage ?? profile.changePercentage ?? 0,
    composite: Math.round(composite),
    signal,
    confidence,
    longTermScore: Math.round(longTerm),
    shortTermScore: Math.round(shortTerm),
    categories,
    generatedAt: new Date().toISOString(),
  };
}
