import type { Coverage } from "@/lib/coverage";

export type Signal = "BUY_SHORT_TERM" | "BUY_LONG_TERM" | "HOLD" | "SHORT";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type CategoryName = "value" | "growth" | "momentum" | "profitability" | "risk";

// Relative-context (Phase 4): where a metric's raw value ranks vs its sector
// cohort and vs the whole universe, from universe-stats quantile breakpoints.
// Percentiles are FAVORABILITY-oriented — a higher number is always more
// favorable (a cheap P/E and a high ROE both rank high), so the figure never
// contradicts the colour-coded score next to it. Null for non-monotonic /
// binary metrics (Beta, RSI, MA cross) and when the bundled universe-stats
// predates quantiles; the UI then hides the figure rather than guessing.
export type MetricRelative = {
  sectorPercentile: number | null;
  universePercentile: number | null;
  scoredAgainst: "sector" | "universe" | null; // which reference the score used
  sectorSize: number | null;
};

export type MetricScore = {
  name: string;
  raw: number | null;
  score: number | null;
  weight: number;
  format?: "percent" | "ratio" | "number";
  relative?: MetricRelative;
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

// "Trader's lens" — technical-setup context for the active/swing trader,
// derived purely from the live price, FMP's 50/200-day moving averages, the
// 52-week range and EOD history. PRESENTATION/CONTEXT only: it does NOT feed the
// five-factor QScore, so a technical overlay can never move a fundamental score.
// All scalars nullable; degrades gracefully on thin history. See trader-lens.ts.
export type TraderSetup =
  | "above_50dma"
  | "below_50dma"
  | "above_200dma"
  | "below_200dma"
  | "uptrend" // 50dma ≥ 200dma (golden-cross regime)
  | "downtrend" // 50dma < 200dma (death-cross regime)
  | "near_52w_high"
  | "near_52w_low"
  | "rising_volume"
  | "strong_momentum";

export type TraderLens = {
  pctFrom50dma: number | null; // signed fraction: +0.04 = 4% above the 50-day SMA
  pctFrom200dma: number | null;
  pctFrom52wHigh: number | null; // ≤ 0 when below the high
  pctFrom52wLow: number | null; // ≥ 0 when above the low
  return20d: number | null; // 20-trading-day price return (fraction)
  volumeTrend: number | null; // 5-day avg share volume ÷ 20-day avg
  setups: TraderSetup[];
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
  // Where this name sits relative to the reference universe the QScore is
  // built on (in-universe / out-of-universe approximation / insufficient data /
  // not an operating company). Surfaced as a badge on every score page so the
  // coverage limitation is visible at the point of use. Optional so
  // snapshot-reconstructed/legacy results stay valid. See lib/coverage.ts.
  coverage?: Coverage;
  categories: CategoryScore[];
  // Tier 1a header context. Optional so snapshot-reconstructed results (which
  // predate this field) and any non-live code path remain valid.
  header?: CompanyHeader;
  // Trader's-lens technical overlay (trend / breakout-proximity / momentum /
  // volume). Optional so snapshot-reconstructed/legacy results stay valid.
  // Derived, presentation-only — never an input to the QScore. See trader-lens.ts.
  lens?: TraderLens;
  generatedAt: string;
  // Present when one or more underlying FMP fetches failed and the stale
  // D1 cache was served instead. ISO timestamp of the oldest cached
  // payload used. Null/undefined means the score is fully live.
  staleSince?: string | null;
  // Settled end-of-day close from FMP EOD history (NOT live /quote), used by
  // the snapshot builder to freeze a timing-independent close into the
  // no-look-ahead ledger. `price`/`changePercent` above stay live for the
  // /score page. Optional so reconstructed/legacy results remain valid.
  // See lib/snapshot-price.ts.
  settledClose?: number | null;
  settledChangePercent?: number | null;
  settledCloseDate?: string | null;
};

// Fama-French factor exposures (migrations/0009_factor_exposures.sql), computed
// monthly by scripts/factor_exposures/run.py and READ here. betas/tstats/alpha
// are null for an insufficient-history name (n_obs < 36, flagged
// "insufficient_history") — the UI renders that state honestly rather than
// drawing empty bars. See lib/scoring/factor-exposures.ts.
export type FactorKey = "mktRf" | "smb" | "hml" | "rmw" | "cma" | "mom";

export type FactorExposureFlag = "insufficient_history" | "low_explanatory_power";

export type FactorExposure = {
  ticker: string;
  snapshotDate: string;
  modelVersion: string | null;
  betas: Record<FactorKey, number | null>;
  tstats: Record<FactorKey, number | null>;
  alphaAnnualized: number | null; // monthly alpha × 12
  alphaTstat: number | null; // raw const t-stat (not annualized)
  r2: number | null;
  adjR2: number | null;
  nObs: number;
  windowStart: string | null;
  windowEnd: string | null;
  styleLabel: string | null;
  flags: FactorExposureFlag[];
};
