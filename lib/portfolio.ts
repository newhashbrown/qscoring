/**
 * Portfolio analysis helpers — pure functions over a list of scored picks.
 *
 * The /portfolio page parses user input, scores each ticker (scoreboard hit
 * or live scoreTicker fallback for long-tail names), then runs the picks
 * through analyzeBlend() here to produce the visible analysis.
 *
 * Stateless by design — no D1 writes, no portfolios persisted unless the
 * user explicitly opts into the "email me a weekly digest" flow (deferred
 * to v1.5).
 */

import type { ScoreboardPick } from "@/data/categories";
import type { CategoryName, Signal } from "@/lib/scoring";

export const MAX_PORTFOLIO_ENTRIES = 30;
const MIN_TICKER_LEN = 1;
const MAX_TICKER_LEN = 10;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export type PortfolioInputEntry = {
  ticker: string;
  /** Optional weight as the user supplied it. Normalized later. */
  rawWeight?: number;
};

export type PortfolioParsed = {
  entries: PortfolioInputEntry[];
  errors: string[];
};

/**
 * Parse the textarea content into an entry list. Each line is one entry:
 *   "AAPL"
 *   "AAPL 10"
 *   "AAPL,10"
 *   "AAPL 10%"
 *   "AAPL  10.5"
 * Lines starting with # are treated as comments and skipped.
 *
 * Returns up to MAX_PORTFOLIO_ENTRIES + an error list for any malformed
 * lines so the UI can show inline feedback instead of silently dropping
 * input.
 */
export function parsePortfolioInput(text: string): PortfolioParsed {
  const errors: string[] = [];
  const entries: PortfolioInputEntry[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;

    // Accept "AAPL", "AAPL 10", "AAPL, 10", "AAPL  10%"
    const cleaned = raw.replace(/[,]/g, " ").replace(/%/g, "").replace(/\s+/g, " ").trim();
    const parts = cleaned.split(" ");
    const ticker = parts[0]?.toUpperCase();
    const rawWeightStr = parts[1];

    if (!ticker || ticker.length < MIN_TICKER_LEN || ticker.length > MAX_TICKER_LEN) {
      errors.push(`Line ${i + 1}: "${raw}" — invalid ticker shape`);
      continue;
    }
    if (!TICKER_RE.test(ticker)) {
      errors.push(`Line ${i + 1}: "${ticker}" — invalid ticker shape`);
      continue;
    }
    if (seen.has(ticker)) {
      errors.push(`Line ${i + 1}: "${ticker}" — duplicate, ignored`);
      continue;
    }

    let rawWeight: number | undefined;
    if (rawWeightStr !== undefined) {
      const w = Number(rawWeightStr);
      if (!Number.isFinite(w) || w <= 0) {
        errors.push(`Line ${i + 1}: "${rawWeightStr}" — invalid weight`);
        continue;
      }
      rawWeight = w;
    }

    seen.add(ticker);
    entries.push({ ticker, rawWeight });

    if (entries.length >= MAX_PORTFOLIO_ENTRIES) {
      errors.push(
        `Capped at ${MAX_PORTFOLIO_ENTRIES} entries — extras after line ${i + 1} ignored`
      );
      break;
    }
  }

  return { entries, errors };
}

export function normalizeWeights(entries: PortfolioInputEntry[]): Array<{
  ticker: string;
  weight: number;
}> {
  if (entries.length === 0) return [];

  const anyExplicit = entries.some((e) => typeof e.rawWeight === "number");
  if (!anyExplicit) {
    // Equal-weight default
    const w = 1 / entries.length;
    return entries.map((e) => ({ ticker: e.ticker, weight: w }));
  }

  // If any weights are explicit, treat missing as equal-weight share of the
  // remaining proportion. Simpler approach: missing weights default to the
  // average of the explicit weights, then renormalize to sum to 1.
  const explicit = entries.filter((e) => typeof e.rawWeight === "number");
  const explicitMean =
    explicit.reduce((s, e) => s + (e.rawWeight as number), 0) / explicit.length;

  const filled = entries.map((e) => ({
    ticker: e.ticker,
    weight: typeof e.rawWeight === "number" ? e.rawWeight : explicitMean,
  }));
  const total = filled.reduce((s, e) => s + e.weight, 0);
  return filled.map((e) => ({ ticker: e.ticker, weight: e.weight / total }));
}

export type PortfolioRow = {
  ticker: string;
  weight: number;
  pick: ScoreboardPick | null;
  error?: string;
};

export type PortfolioAnalysis = {
  rows: PortfolioRow[];
  scoredWeight: number;
  failedWeight: number;
  aggregate: {
    composite: number;
    factors: Record<CategoryName, number>;
  };
  signalDistribution: Record<Signal, { count: number; weight: number }>;
  sectorBreakdown: Array<{ sector: string; weight: number; count: number }>;
  strongest: PortfolioRow[];
  weakest: PortfolioRow[];
  confidence: {
    coverageWeight: number;
    highConfidenceWeight: number;
    averageDataCompleteness: number;
  };
  generatedAt: string;
};

const FACTOR_NAMES: CategoryName[] = ["value", "growth", "momentum", "profitability", "risk"];
const SIGNALS: Signal[] = ["BUY_LONG_TERM", "BUY_SHORT_TERM", "HOLD", "SHORT"];

function pickFactorScore(p: ScoreboardPick, name: CategoryName): number {
  return p.categories.find((c) => c.name === name)?.score ?? 0;
}

function pickSector(p: ScoreboardPick): string {
  // ScoreboardPick doesn't carry sector today — we leave the field for the
  // caller to populate from a side lookup if available. Default bucket is
  // "Unknown" so the UI never renders an empty group.
  return (p as ScoreboardPick & { sector?: string }).sector ?? "Unknown";
}

export function analyzeBlend(rows: PortfolioRow[]): PortfolioAnalysis {
  const scored = rows.filter((r) => r.pick !== null);
  const scoredWeight = scored.reduce((s, r) => s + r.weight, 0);
  const failedWeight = rows.reduce((s, r) => s + r.weight, 0) - scoredWeight;

  // Aggregate composite + per-factor by weighted average over scored rows.
  // If nothing scored, return zeros so the UI can show an honest
  // "no scores available" state instead of NaN.
  const safeWeight = scoredWeight > 0 ? scoredWeight : 1;

  const compositeNum =
    scored.reduce((s, r) => s + r.weight * (r.pick?.composite ?? 0), 0) / safeWeight;

  const factors = FACTOR_NAMES.reduce((acc, name) => {
    const num = scored.reduce(
      (s, r) => s + r.weight * (r.pick ? pickFactorScore(r.pick, name) : 0),
      0
    );
    acc[name] = num / safeWeight;
    return acc;
  }, {} as Record<CategoryName, number>);

  const signalDistribution = SIGNALS.reduce((acc, sig) => {
    const matches = scored.filter((r) => r.pick?.signal === sig);
    acc[sig] = {
      count: matches.length,
      weight: matches.reduce((s, r) => s + r.weight, 0),
    };
    return acc;
  }, {} as Record<Signal, { count: number; weight: number }>);

  const sectorMap = new Map<string, { weight: number; count: number }>();
  for (const r of scored) {
    if (!r.pick) continue;
    const sector = pickSector(r.pick);
    const cur = sectorMap.get(sector) ?? { weight: 0, count: 0 };
    cur.weight += r.weight;
    cur.count += 1;
    sectorMap.set(sector, cur);
  }
  const sectorBreakdown = Array.from(sectorMap.entries())
    .map(([sector, v]) => ({ sector, weight: v.weight, count: v.count }))
    .sort((a, b) => b.weight - a.weight);

  const sortedByComposite = [...scored].sort(
    (a, b) => (b.pick?.composite ?? 0) - (a.pick?.composite ?? 0)
  );
  const strongest = sortedByComposite.slice(0, 3);
  const weakest = sortedByComposite.slice(-3).reverse();

  const highConfidenceWeight = scored
    .filter((r) => r.pick?.confidence === "HIGH")
    .reduce((s, r) => s + r.weight, 0);

  return {
    rows,
    scoredWeight,
    failedWeight,
    aggregate: { composite: compositeNum, factors },
    signalDistribution,
    sectorBreakdown,
    strongest,
    weakest,
    confidence: {
      coverageWeight: scoredWeight,
      highConfidenceWeight,
      // Avg data completeness placeholder — scoreboard rows don't carry
      // per-category completeness, so we use HIGH-confidence share as the
      // proxy. Real per-row completeness comes if we ever shift to
      // calling scoreTicker for the analysis (more expensive but richer).
      averageDataCompleteness: scoredWeight > 0 ? highConfidenceWeight / scoredWeight : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}
