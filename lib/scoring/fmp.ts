const BASE = "https://financialmodelingprep.com/stable";

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY environment variable is not set");
  return key;
}

async function fmpGet<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("apikey", getApiKey());
  const res = await fetch(url.toString(), {
    next: { revalidate: 900 },
  });
  if (!res.ok) {
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
  return res.json() as Promise<T>;
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
  profile: (symbol: string) => fmpGet<Profile[]>("/profile", { symbol }),
  quote: (symbol: string) => fmpGet<Quote[]>("/quote", { symbol }),
  ratiosTtm: (symbol: string) => fmpGet<RatiosTtm[]>("/ratios-ttm", { symbol }),
  keyMetricsTtm: (symbol: string) =>
    fmpGet<KeyMetricsTtm[]>("/key-metrics-ttm", { symbol }),
  financialGrowth: (symbol: string) =>
    fmpGet<FinancialGrowth[]>("/financial-growth", { symbol, limit: 1 }),
  historical: (symbol: string) =>
    fmpGet<PricePoint[]>("/historical-price-eod/light", { symbol }),
};
