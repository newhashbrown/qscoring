import { readCache, recordStale, writeCacheAsync } from "./fmp-cache";
import { massive } from "../massive/client";

const BASE = "https://financialmodelingprep.com/stable";

// How far back to ask Massive when falling back for historical bars.
// 730 calendar days ≈ 500 trading days, comfortably covering the longest
// momentum window (12mo return + 60d vol).
const MASSIVE_FALLBACK_DAYS = 730;

// Thrown for FMP responses where stale data won't help: the ticker isn't in
// the plan (402) or doesn't exist (404). These bubble straight to the caller
// so users see the helpful message instead of stale data from a delisted or
// out-of-plan symbol.
class FmpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmpUnavailableError";
  }
}

// Tiered cache TTLs, sized to how often each FMP endpoint actually changes.
// Uniform 15-min caching across all endpoints used to wastefully refresh
// fundamentals (which only update on quarterly filings) and EOD prices (which
// only update once per market close), which made traffic spikes blow through
// FMP's 300 req/min ceiling.
const TTL = {
  quote: 900,             // 15 min — real-time-ish intraday price
  priceHistory: 21600,    // 6 h — EOD prices update once after US market close
  profile: 86400,         // 24 h — sector/industry/beta rarely change
  fundamentals: 86400,    // 24 h — TTM ratios & key metrics roll on quarterly filings
} as const;

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY environment variable is not set");
  return key;
}

// FMP's /stable/* endpoints use hyphens for class shares (BRK-B, BF-B), not the
// dotted form most users type. Normalize before sending; the user-facing ticker
// keeps whatever form they entered.
function fmpSymbol(symbol: string): string {
  return symbol.replace(/\./g, "-");
}

async function fmpFetchLive<T>(
  path: string,
  params: Record<string, string | number>,
  revalidateSeconds: number
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("apikey", getApiKey());

  // Retry on 429 (rate limit) up to twice with exponential backoff. Other errors
  // are surfaced immediately because retry won't help.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url.toString(), {
      next: { revalidate: revalidateSeconds },
    });
    if (res.ok) return res.json() as Promise<T>;

    if (res.status === 429 && attempt < maxAttempts) {
      const waitMs = 2000 * Math.pow(2, attempt - 1); // 2s, 4s
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const body = await res.text().catch(() => "");
    if (res.status === 402) {
      throw new FmpUnavailableError(
        "This ticker isn't included in the current data plan. Try a major US-listed equity like AAPL, NVDA, or MSFT."
      );
    }
    if (res.status === 404) {
      throw new FmpUnavailableError(
        "Ticker not found. Double-check the symbol and try again."
      );
    }
    throw new Error(`FMP ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  throw new Error(`FMP ${path}: exhausted retries`);
}

async function fmpGet<T>(
  path: string,
  params: Record<string, string | number> = {},
  revalidateSeconds: number = TTL.quote,
  cacheKey?: string
): Promise<T> {
  try {
    const data = await fmpFetchLive<T>(path, params, revalidateSeconds);
    if (cacheKey) writeCacheAsync(cacheKey, data);
    return data;
  } catch (err) {
    // "Ticker doesn't exist / not in plan" — stale data won't help.
    if (err instanceof FmpUnavailableError) throw err;

    // Transient (429-exhausted, 5xx, network): serve last-known-good if any.
    if (cacheKey) {
      const stale = await readCache<T>(cacheKey);
      if (stale) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `fmp_cache: serving stale ${cacheKey} (fetched ${stale.fetchedAt}) — live failed: ${msg}`
        );
        recordStale(cacheKey, stale.fetchedAt);
        return stale.data;
      }
    }
    throw err;
  }
}

export type Profile = {
  symbol: string;
  companyName: string;
  price: number;
  changePercentage: number;
  marketCap: number;
  beta: number;
  sector: string;
  industry: string;
  isActivelyTrading: boolean;
  isEtf: boolean;
  isFund: boolean;
  // Tier 1a header fields — present in the /profile payload we already fetch,
  // surfaced here so the company-snapshot header needs no extra call for them.
  averageVolume: number; // FMP-reported average daily share volume
  range: string; // 52-week range, e.g. "195.07-317.4"
  lastDividend: number;
};

// /shares-float — shares outstanding + free float. One extra call per ticker;
// quarterly-slow-moving, so it rides the 24h fundamentals TTL.
//
// NOTE on point-in-time integrity: `date` here is FMP's data-refresh timestamp
// (e.g. "2026-06-14 11:20:05"), NOT a clean SEC filing date — the real filing
// period is only in the `source` URL. The header therefore shows no "as of"
// for shares/float in Phase 1; clean filingDate/acceptedDate as-of treatment
// arrives with the statement endpoints in Phase 2. Captured but unused for now.
export type SharesFloat = {
  symbol: string;
  date: string | null;
  freeFloat: number | null; // percent of shares free-floating (99.83 = 99.83%)
  floatShares: number | null;
  outstandingShares: number | null;
};

export type Quote = {
  symbol: string;
  price: number;
  changePercentage: number;
  priceAvg50: number;
  priceAvg200: number;
  marketCap: number;
  // FMP /quote returns this; declared here for the movers dollar-volume floor.
  // Unused by scoring (score.ts reads price/changePercentage/priceAvg*).
  volume: number;
};

export type RatiosTtm = {
  priceToEarningsRatioTTM: number | null;
  priceToBookRatioTTM: number | null;
  priceToSalesRatioTTM: number | null;
  priceToEarningsGrowthRatioTTM: number | null;
  grossProfitMarginTTM: number | null;
  operatingProfitMarginTTM: number | null;
  netProfitMarginTTM: number | null;
  debtToEquityRatioTTM: number | null;
  dividendYieldTTM: number | null;
  interestCoverageRatioTTM: number | null;
};

export type KeyMetricsTtm = {
  marketCap: number;
  evToEBITDATTM: number | null;
  returnOnEquityTTM: number | null;
  returnOnAssetsTTM: number | null;
  returnOnInvestedCapitalTTM: number | null;
  freeCashFlowYieldTTM: number | null;
  earningsYieldTTM: number | null;
  netDebtToEBITDATTM: number | null;
};

export type FinancialGrowth = {
  revenueGrowth: number | null;
  epsgrowth: number | null;
  netIncomeGrowth: number | null;
  ebitdaGrowth: number | null;
  freeCashFlowGrowth: number | null;
  threeYRevenueGrowthPerShare: number | null;
};

export type PricePoint = {
  symbol: string;
  date: string;
  price: number;
  volume: number;
};

// Multi-year statements (Phase 2 / Tier 1b). `date` is the fiscal period end;
// `filingDate`/`acceptedDate` give the point-in-time "as of" the page displays.
// Margins are derived from these absolutes (no separate /ratios call) so every
// figure in a year ties out internally.
export type IncomeStatement = {
  date: string;
  filingDate: string | null;
  acceptedDate: string | null;
  fiscalYear: string;
  period: string;
  reportedCurrency: string | null;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  epsDiluted: number | null;
};

export type CashFlowStatement = {
  date: string;
  filingDate: string | null;
  fiscalYear: string;
  period: string;
  freeCashFlow: number | null;
  // Capital-return fields (Phase 5b shareholder yield). FMP reports cash
  // OUTFLOWS as negative, so a net buyback is a negative netStockIssuance.
  netStockIssuance: number | null;
  commonStockRepurchased: number | null;
  commonDividendsPaid: number | null;
};

// /earnings — past rows carry actual vs estimate; the nearest future row (null
// actual) is the next scheduled report, used for the within-5-trading-days
// stale-data flag.
export type EarningsRow = {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimated: number | null;
  revenueActual: number | null;
  revenueEstimated: number | null;
};

// /grades-consensus — current analyst rating counts + the consensus label.
export type GradeConsensus = {
  symbol: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  consensus: string | null;
};

// /grades-historical — monthly snapshots of the rating distribution, used to
// derive the rating REVISION trend (are analysts upgrading or downgrading?).
export type GradeHistoryRow = {
  symbol: string;
  date: string;
  analystRatingsStrongBuy: number;
  analystRatingsBuy: number;
  analystRatingsHold: number;
  analystRatingsSell: number;
  analystRatingsStrongSell: number;
};

// /price-target-summary — rolling average analyst price targets by window.
// last-month vs last-quarter is the estimate-REVISION signal (are analysts
// raising or cutting their targets?).
export type PriceTargetSummary = {
  symbol: string;
  lastMonthCount: number;
  lastMonthAvgPriceTarget: number | null;
  lastQuarterCount: number;
  lastQuarterAvgPriceTarget: number | null;
  lastYearCount: number;
  lastYearAvgPriceTarget: number | null;
};

// /financial-scores — bankruptcy/quality composites (Phase 5b quality screens).
export type FinancialScores = {
  symbol: string;
  altmanZScore: number | null;
  piotroskiScore: number | null;
  ebit: number | null;
  marketCap: number | null;
};

export const fmp = {
  profile: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<Profile[]>("/profile", { symbol: s }, TTL.profile, `profile:${s}`);
  },
  quote: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<Quote[]>("/quote", { symbol: s }, TTL.quote, `quote:${s}`);
  },
  ratiosTtm: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<RatiosTtm[]>(
      "/ratios-ttm",
      { symbol: s },
      TTL.fundamentals,
      `ratiosTtm:${s}`
    );
  },
  keyMetricsTtm: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<KeyMetricsTtm[]>(
      "/key-metrics-ttm",
      { symbol: s },
      TTL.fundamentals,
      `keyMetricsTtm:${s}`
    );
  },
  financialGrowth: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<FinancialGrowth[]>(
      "/financial-growth",
      { symbol: s, limit: 1 },
      TTL.fundamentals,
      `financialGrowth:${s}`
    );
  },
  sharesFloat: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<SharesFloat[]>(
      "/shares-float",
      { symbol: s },
      TTL.fundamentals,
      `sharesFloat:${s}`
    );
  },
  incomeStatement: (symbol: string, limit = 5) => {
    const s = fmpSymbol(symbol);
    return fmpGet<IncomeStatement[]>(
      "/income-statement",
      { symbol: s, limit },
      TTL.fundamentals,
      `income:${s}:${limit}`
    );
  },
  cashFlowStatement: (symbol: string, limit = 5) => {
    const s = fmpSymbol(symbol);
    return fmpGet<CashFlowStatement[]>(
      "/cash-flow-statement",
      { symbol: s, limit },
      TTL.fundamentals,
      `cashflow:${s}:${limit}`
    );
  },
  earnings: (symbol: string, limit = 12) => {
    const s = fmpSymbol(symbol);
    return fmpGet<EarningsRow[]>(
      "/earnings",
      { symbol: s, limit },
      TTL.fundamentals,
      `earnings:${s}:${limit}`
    );
  },
  gradesConsensus: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<GradeConsensus[]>(
      "/grades-consensus",
      { symbol: s },
      TTL.fundamentals,
      `gradesConsensus:${s}`
    );
  },
  gradesHistorical: (symbol: string, limit = 12) => {
    const s = fmpSymbol(symbol);
    return fmpGet<GradeHistoryRow[]>(
      "/grades-historical",
      { symbol: s, limit },
      TTL.fundamentals,
      `gradesHistorical:${s}:${limit}`
    );
  },
  priceTargetSummary: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<PriceTargetSummary[]>(
      "/price-target-summary",
      { symbol: s },
      TTL.fundamentals,
      `priceTargetSummary:${s}`
    );
  },
  financialScores: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<FinancialScores[]>(
      "/financial-scores",
      { symbol: s },
      TTL.fundamentals,
      `financialScores:${s}`
    );
  },
  historical: (symbol: string) => {
    const s = fmpSymbol(symbol);
    return fmpGet<PricePoint[]>(
      "/historical-price-eod/light",
      { symbol: s },
      TTL.priceHistory,
      `historical:${s}`
    ).catch(async (err) => {
      // Don't fall back when the ticker simply isn't in plan / doesn't exist.
      if (err instanceof FmpUnavailableError) throw err;

      // FMP is transiently down AND we had no stale cache. Try Massive.
      // Fundamentals (ratios, key metrics, growth) have no Massive equivalent
      // so they stay FMP-only — this only protects the price/history layer.
      try {
        const today = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - MASSIVE_FALLBACK_DAYS * 86_400_000)
          .toISOString().slice(0, 10);
        const bars = await massive.historical(symbol, from, today);
        if (bars.length === 0) throw err;
        console.warn(
          `fmp_fallback: served ${s} historical from Massive (${bars.length} bars)`
        );
        return bars.map((bar) => ({
          symbol,
          date: new Date(bar.t).toISOString().slice(0, 10),
          price: bar.c,
          volume: bar.v,
        }));
      } catch (massiveErr) {
        // Surface the original FMP error to the caller, but log Massive's
        // own failure so a broken fallback doesn't sit invisible in prod.
        console.warn(
          `fmp_fallback: massive failed for ${s}:`,
          massiveErr instanceof Error ? massiveErr.message : massiveErr
        );
        throw err;
      }
    });
  },
};
