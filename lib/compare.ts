/**
 * Comparison helpers for /compare/[pair].
 *
 * Parses URL slugs like "nvda-vs-amd" into a normalized [tickerA, tickerB]
 * tuple, validates ticker shape, and produces deterministic "key reason"
 * prose summarizing which side wins and why. Comparison pages read scores
 * from data/scoreboard.json first; long-tail pairs fall back to scoreTicker.
 */

import type { ScoreboardPick } from "@/data/categories";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const SEPARATOR = "-vs-";
// Tolerance below which we say composites are "essentially the same"
// instead of declaring a winner — avoids overstating tiny differences.
const COMPOSITE_TIE_THRESHOLD = 3;

/**
 * Curated list of high-search-intent pairs. SSG'd via generateStaticParams
 * so they're served as instant static HTML; other pairs render on demand
 * via ISR. Each pair must use tickers in PICKS_UNIVERSE so the scoreboard
 * lookup hits without a live FMP fan-out at SSR.
 */
export const CURATED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["NVDA", "AMD"],
  ["AAPL", "MSFT"],
  ["GOOGL", "META"],
  ["AMZN", "WMT"],
  ["JPM", "BAC"],
  ["V", "MA"],
  ["KO", "PEP"],
  ["MCD", "SBUX"],
  ["HD", "COST"],
  ["ORCL", "CRM"],
  ["ADBE", "CRM"],
  ["DIS", "NFLX"],
  ["AMD", "AVGO"],
  ["AAPL", "GOOGL"],
  ["TSLA", "AAPL"],
];

export function pairToSlug(a: string, b: string): string {
  return `${a}${SEPARATOR}${b}`.toLowerCase();
}

export function parsePairSlug(slug: string): [string, string] | null {
  if (!slug) return null;
  const parts = slug.toLowerCase().split(SEPARATOR);
  if (parts.length !== 2) return null;
  const a = parts[0].toUpperCase();
  const b = parts[1].toUpperCase();
  if (!TICKER_RE.test(a) || !TICKER_RE.test(b)) return null;
  if (a === b) return null;
  return [a, b];
}

export type CompareSide = ScoreboardPick & {
  longTermScore: number;
  shortTermScore: number;
};

function factorScore(p: CompareSide, name: string): number {
  return p.categories.find((c) => c.name === name)?.score ?? 0;
}

export type RowVerdict = "a" | "b" | "tie";

function rowVerdict(aValue: number, bValue: number, tieTolerance = 1): RowVerdict {
  if (Math.abs(aValue - bValue) <= tieTolerance) return "tie";
  return aValue > bValue ? "a" : "b";
}

export type ComparisonRow = {
  label: string;
  aValue: number | string;
  bValue: number | string;
  verdict: RowVerdict;
  // True when "lower is better" — winner displayed accordingly. Only used
  // for risk-related rows where a lower number is preferable. For factor
  // scores in QScoring, higher is always better (the factor is itself
  // the "this much value/growth/etc." score), so we don't need to invert.
  lowerIsBetter?: boolean;
};

export function buildComparisonRows(a: CompareSide, b: CompareSide): ComparisonRow[] {
  const rows: ComparisonRow[] = [
    {
      label: "Composite QScore",
      aValue: a.composite,
      bValue: b.composite,
      verdict: rowVerdict(a.composite, b.composite),
    },
    {
      label: "Long-term score",
      aValue: a.longTermScore,
      bValue: b.longTermScore,
      verdict: rowVerdict(a.longTermScore, b.longTermScore),
    },
    {
      label: "Short-term score",
      aValue: a.shortTermScore,
      bValue: b.shortTermScore,
      verdict: rowVerdict(a.shortTermScore, b.shortTermScore),
    },
    {
      label: "Value",
      aValue: factorScore(a, "value"),
      bValue: factorScore(b, "value"),
      verdict: rowVerdict(factorScore(a, "value"), factorScore(b, "value")),
    },
    {
      label: "Growth",
      aValue: factorScore(a, "growth"),
      bValue: factorScore(b, "growth"),
      verdict: rowVerdict(factorScore(a, "growth"), factorScore(b, "growth")),
    },
    {
      label: "Momentum",
      aValue: factorScore(a, "momentum"),
      bValue: factorScore(b, "momentum"),
      verdict: rowVerdict(factorScore(a, "momentum"), factorScore(b, "momentum")),
    },
    {
      label: "Profitability",
      aValue: factorScore(a, "profitability"),
      bValue: factorScore(b, "profitability"),
      verdict: rowVerdict(factorScore(a, "profitability"), factorScore(b, "profitability")),
    },
    {
      label: "Risk",
      aValue: factorScore(a, "risk"),
      bValue: factorScore(b, "risk"),
      verdict: rowVerdict(factorScore(a, "risk"), factorScore(b, "risk")),
    },
  ];

  return rows;
}

/**
 * Deterministic prose summarizing which ticker comes out ahead and why.
 * Looks at composite difference first; if they're within the tie threshold
 * the verdict says "essentially equivalent" instead of overstating the
 * gap. Otherwise picks the factor with the largest gap in the winner's
 * favor as the explanation.
 */
export function keyReason(a: CompareSide, b: CompareSide): string {
  const compositeDiff = a.composite - b.composite;

  if (Math.abs(compositeDiff) < COMPOSITE_TIE_THRESHOLD) {
    return (
      `${a.ticker} and ${b.ticker} land within ${COMPOSITE_TIE_THRESHOLD} composite points of each ` +
      `other (${a.composite} vs ${b.composite}) — the QScore considers them broadly comparable. ` +
      `The factor breakdown below shows where each one lands relative to the other on value, ` +
      `growth, momentum, profitability, and risk.`
    );
  }

  const winner = compositeDiff > 0 ? a : b;
  const loser = compositeDiff > 0 ? b : a;

  // Find the factor with the largest gap in the winner's favor.
  const factorNames = ["value", "growth", "momentum", "profitability", "risk"] as const;
  const gaps = factorNames.map((name) => {
    const wScore = factorScore(winner, name);
    const lScore = factorScore(loser, name);
    return { name, gap: wScore - lScore, wScore, lScore };
  });
  const widest = [...gaps].sort((x, y) => y.gap - x.gap)[0];
  const factorLabel =
    winner.categories.find((c) => c.name === widest.name)?.label.toLowerCase() ?? widest.name;

  return (
    `${winner.ticker} leads ${loser.ticker} by ${Math.abs(compositeDiff)} composite points ` +
    `(${winner.composite} vs ${loser.composite}). The biggest single driver is ${factorLabel} ` +
    `(${widest.wScore} vs ${widest.lScore}, a ${widest.gap}-point edge for ${winner.ticker}). ` +
    `Each ticker page below has the full factor breakdown.`
  );
}
