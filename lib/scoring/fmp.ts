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
};

export type Quote = {
  symbol: string;
  price: number;
  changePercentage: number;
  priceAvg50: number;
  priceAvg200: number;
  marketCap: number;
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
