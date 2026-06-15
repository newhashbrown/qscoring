export type Signal = "BUY_SHORT_TERM" | "BUY_LONG_TERM" | "HOLD" | "SHORT";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type CategoryName = "value" | "growth" | "momentum" | "profitability" | "risk";

export type MetricScore = {
  name: string;
  raw: number | null;
  score: number | null;
  weight: number;
  format?: "percent" | "ratio" | "number";
};

export type CategoryScore = {
  name: CategoryName;
  label: string;
  score: number;
  weightLong: number;
  weightShort: number;
  metrics: MetricScore[];
  completeness: number;
};

// Tier 1a company-snapshot header. Point-in-time company facts shown above the
// five-factor breakdown. All fields nullable — FMP coverage is uneven across
// the universe and the header degrades gracefully rather than hiding the block.
export type SizeBucket = "mega" | "large" | "mid" | "small" | "micro";

export type CompanyHeader = {
  marketCap: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  freeFloatPercent: number | null; // 99.83 = 99.83% of shares are free-floating
  avgDollarVolume20: number | null; // 20-trading-day mean of price × volume, USD
  week52High: number | null;
  week52Low: number | null;
  dividendYield: number | null; // fraction (0.0042 = 0.42%)
  sizeBucket: SizeBucket | null;
};

export type ScoreResult = {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  price: number;
  changePercent: number;
  composite: number;
  signal: Signal;
  confidence: Confidence;
  longTermScore: number;
  shortTermScore: number;
  categories: CategoryScore[];
  // Tier 1a header context. Optional so snapshot-reconstructed results (which
  // predate this field) and any non-live code path remain valid.
  header?: CompanyHeader;
  generatedAt: string;
  // Present when one or more underlying FMP fetches failed and the stale
  // D1 cache was served instead. ISO timestamp of the oldest cached
  // payload used. Null/undefined means the score is fully live.
  staleSince?: string | null;
};
