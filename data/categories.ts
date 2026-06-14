/**
 * Category landing-page definitions for /scores/[slug]. Each category is
 * either a curated ticker list (themes like "AI Stocks") or a predicate
 * over the scoreboard (signal/factor-driven categories like
 * "Buy Short-Term"). Pages render the resulting picks as a grid.
 */

import type { CategoryName, CompanyHeader, Signal } from "@/lib/scoring";

export type ScoreboardPick = {
  ticker: string;
  companyName: string;
  sector?: string;
  price: number;
  changePercent: number;
  composite: number;
  signal: Signal;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  longTermScore?: number;
  shortTermScore?: number;
  categories: Array<{ name: CategoryName; label: string; score: number }>;
  // Tier 1a header scalars present on snapshots written on/after the Phase-1
  // pipeline change; absent on historical snapshots (optional by design).
  header?: CompanyHeader;
};

export type CategorySelector =
  | { type: "tickers"; tickers: readonly string[] }
  | { type: "signal"; signal: Signal }
  | { type: "topByFactor"; factor: CategoryName; limit: number }
  | {
      type: "predicate";
      predicate: (p: ScoreboardPick) => boolean;
    };

export type CategoryDef = {
  slug: string;
  title: string;
  shortDescription: string;
  intro: string[];
  criteriaLabel: string;
  selector: CategorySelector;
};

function factorScore(p: ScoreboardPick, factor: CategoryName): number {
  return p.categories.find((c) => c.name === factor)?.score ?? 0;
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "ai-stocks",
    title: "AI Stocks",
    shortDescription:
      "QScore breakdown for the major AI infrastructure, semiconductor, and platform companies driving the buildout.",
    intro: [
      "AI infrastructure has reshaped the equity landscape over the past three years — the largest gains have flowed to companies supplying compute, networking, and platform layers, not just the model labs themselves.",
      "Below is the QScore for the names with the most direct AI exposure across hardware (NVIDIA, AMD, Broadcom, TSMC), hyperscalers (Microsoft, Google, Amazon, Meta), and software/security adjacencies (Oracle, Salesforce, Palantir, Palo Alto Networks, CrowdStrike). Each card links through to the full factor breakdown.",
    ],
    criteriaLabel: "Curated list of AI-exposure equities",
    selector: {
      type: "tickers",
      tickers: [
        "NVDA",
        "MSFT",
        "GOOGL",
        "META",
        "AMZN",
        "AMD",
        "AVGO",
        "ORCL",
        "CRM",
        "PANW",
        "CRWD",
        "TSLA",
      ],
    },
  },
  {
    slug: "large-cap-tech",
    title: "Large-Cap Tech Stocks",
    shortDescription:
      "QScore for US-listed large-cap technology names — software, semiconductors, internet platforms.",
    intro: [
      "Large-cap technology dominates US index weighting and remains the most-followed equity sector. The QScore framework lets you compare names that look superficially similar — Apple vs Microsoft, NVIDIA vs AMD — on a like-for-like basis across value, growth, momentum, profitability, and risk.",
      "All names below are sector-normalized against tech peers, so the scores reflect relative strength within the sector rather than absolute dollars.",
    ],
    criteriaLabel: "Curated list of large-cap tech equities",
    selector: {
      type: "tickers",
      tickers: [
        "AAPL",
        "MSFT",
        "NVDA",
        "GOOGL",
        "META",
        "AMZN",
        "AVGO",
        "ORCL",
        "CRM",
        "ADBE",
        "AMD",
        "QCOM",
        "TXN",
        "INTU",
        "NOW",
      ],
    },
  },
  {
    slug: "buy-short-term",
    title: "Buy Short-Term Stocks",
    shortDescription:
      "Stocks where the QScore short-term composite cleared the buy threshold — driven by momentum and quality, not pure fundamentals.",
    intro: [
      "The Buy Short-Term signal fires when the short-term composite (weighted toward momentum and risk) is at least 65 and the underlying momentum factor is at least 60. It captures stocks the market is currently rewarding rather than stocks the fundamentals say are cheap.",
      "By construction this list is dynamic — the universe scanned is the same 66 large-cap names that feed the homepage carousel, and only those clearing the threshold appear here. An empty list means no name in the universe crossed the bar today.",
    ],
    criteriaLabel: "Signal = Buy Short-Term",
    selector: { type: "signal", signal: "BUY_SHORT_TERM" },
  },
  {
    slug: "high-momentum-stocks",
    title: "High-Momentum Stocks",
    shortDescription:
      "Top names ranked by the QScore momentum factor — trailing returns, RSI, and moving-average position.",
    intro: [
      "Momentum is one of the most replicated findings in academic finance: stocks that have outperformed recently tend to keep outperforming over 3–12 month horizons. The QScore momentum category combines 12-month, 3-month, and 1-month returns with RSI(14) and the 50/200-day moving-average crossover.",
      "The list below is the top of the universe ranked purely by momentum factor score. Composite QScore and signal are shown for context — a high momentum score doesn't necessarily mean Buy unless the rest of the factor stack supports it.",
    ],
    criteriaLabel: "Top by momentum factor score",
    selector: { type: "topByFactor", factor: "momentum", limit: 12 },
  },
  {
    slug: "high-growth-low-value",
    title: "High-Growth, Low-Value Stocks",
    shortDescription:
      "Names where the growth factor is strong (≥ 60) but the value factor is weak (≤ 40) — the classic 'expensive but growing' profile.",
    intro: [
      "High growth at a high price is the canonical growth-investing trade. These names score in the top tier on revenue, EPS, and free-cash-flow growth, but expensive on the value multiples — high P/E, high P/S, rich EV/EBITDA. They're the opposite of a value play, and over multi-decade horizons their factor bets work in different macro regimes.",
      "The QScore framework doesn't choose between value and growth — it scores them as independent dimensions and lets you see who lands in which corner of the matrix. The page below isolates the growth corner.",
    ],
    criteriaLabel: "Growth ≥ 60 AND Value ≤ 40",
    selector: {
      type: "predicate",
      predicate: (p) => factorScore(p, "growth") >= 60 && factorScore(p, "value") <= 40,
    },
  },
];

export const CATEGORIES_BY_SLUG: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c])
);

export function selectPicks(
  scoreboard: ScoreboardPick[],
  selector: CategorySelector
): ScoreboardPick[] {
  switch (selector.type) {
    case "tickers": {
      const want = new Set(selector.tickers);
      const matched = scoreboard.filter((p) => want.has(p.ticker));
      // Preserve curated order from the selector list.
      return selector.tickers
        .map((t) => matched.find((p) => p.ticker === t))
        .filter((p): p is ScoreboardPick => Boolean(p));
    }
    case "signal":
      return scoreboard
        .filter((p) => p.signal === selector.signal)
        .sort((a, b) => b.composite - a.composite);
    case "topByFactor": {
      const factor = selector.factor;
      return [...scoreboard]
        .sort((a, b) => factorScore(b, factor) - factorScore(a, factor))
        .slice(0, selector.limit);
    }
    case "predicate":
      return scoreboard.filter(selector.predicate).sort((a, b) => b.composite - a.composite);
  }
}
