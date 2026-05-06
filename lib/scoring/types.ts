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
  generatedAt: string;
};
