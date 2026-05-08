const BASE = "https://financialmodelingprep.com/stable";

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

async function fmpGet<T>(
  path: string,
  params: Record<string, string | number> = {},
  revalidateSeconds: number = TTL.quote
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
      throw new Error(
        "This ticker isn't included in the current data plan. Try a major US-listed equity like AAPL, NVDA, or MSFT."
      );
    }
    if (res.status === 404) {
      throw new Error("Ticker not found. Double-check the symbol and try again.");
    }
    throw new Error(`FMP ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  throw new Error(`FMP ${path}: exhausted retries`);
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
  profile: (symbol: string) =>
    fmpGet<Profile[]>("/profile", { symbol: fmpSymbol(symbol) }, TTL.profile),
  quote: (symbol: string) =>
    fmpGet<Quote[]>("/quote", { symbol: fmpSymbol(symbol) }, TTL.quote),
  ratiosTtm: (symbol: string) =>
    fmpGet<RatiosTtm[]>("/ratios-ttm", { symbol: fmpSymbol(symbol) }, TTL.fundamentals),
  keyMetricsTtm: (symbol: string) =>
    fmpGet<KeyMetricsTtm[]>("/key-metrics-ttm", { symbol: fmpSymbol(symbol) }, TTL.fundamentals),
  financialGrowth: (symbol: string) =>
    fmpGet<FinancialGrowth[]>(
      "/financial-growth",
      { symbol: fmpSymbol(symbol), limit: 1 },
      TTL.fundamentals
    ),
  historical: (symbol: string) =>
    fmpGet<PricePoint[]>(
      "/historical-price-eod/light",
      { symbol: fmpSymbol(symbol) },
      TTL.priceHistory
    ),
};
