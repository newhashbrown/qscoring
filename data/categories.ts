/**
 * Category landing-page definitions for /scores/[slug]. Each category is
 * either a curated ticker list (themes like "AI Stocks") or a predicate
 * over the scoreboard (signal/factor-driven categories like
 * "Buy Short-Term"). Pages render the resulting picks as a grid.
 */

import type { CategoryName, CompanyHeader, Signal } from "@/lib/scoring";
import policyLevelsData from "@/data/policy-levels.json";

// Levels-only projection of the policy_exposures D1 table (data/policy-levels.json,
// written by scripts/export-policy-levels.ts). Imported here — NOT baked into the
// daily-rebuilt scoreboard.json — so the policy category predicates below can
// filter picks on their own cadence. categories.ts is server-only, so this map
// never ships to the client. Regenerate with `npm run policy-levels`.
const POLICY_LEVELS_MAP = policyLevelsData.levels as Record<string, Record<string, string>>;

/** Policy exposure level for a ticker+theme, or undefined if unclassified. */
function policyLevel(ticker: string, theme: string): string | undefined {
  return POLICY_LEVELS_MAP[ticker.toUpperCase()]?.[theme];
}

// Same framing the on-page chips carry — required at parity because a public,
// SEO-indexed page that names companies under a charged theme is a higher-stakes
// surface than a detail-page chip.
const POLICY_DISCLAIMER =
  "These tags are AI-classified policy/regulatory sensitivity, derived from each company's sector, industry, and business description. They describe exposure and sensitivity only — not a political opinion, a claim of wrongdoing, a prediction of government action, or investment advice.";

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
  {
    slug: "high-tariff-exposure",
    title: "High Tariff Exposure Stocks",
    shortDescription:
      "Companies whose costs or revenue are most sensitive to import tariffs and trade policy — global manufacturers, importers, and cross-border supply chains.",
    intro: [
      "Tariffs land unevenly. A domestic services business barely notices them; a company that imports components, assembles goods abroad, or sells into markets that can retaliate feels them directly in cost of goods and margins. This list isolates the names carrying the highest tariff sensitivity in the QScore universe.",
      "It reads across sectors — consumer electronics and hardware, autos and industrials, and materials producers exposed to cross-border metals flows all surface here. Each card links to the full QScore breakdown; the tariff tag reflects the strength of the policy channel to the business, not a view on the stock.",
      POLICY_DISCLAIMER,
    ],
    criteriaLabel: "Policy exposure: tariffs = High",
    selector: { type: "predicate", predicate: (p) => policyLevel(p.ticker, "tariffs") === "high" },
  },
  {
    slug: "high-drug-pricing-exposure",
    title: "High Drug-Pricing Exposure Stocks",
    shortDescription:
      "Pharmaceutical, biotech, insurer, and distributor names most exposed to drug-pricing policy — government negotiation, reimbursement, and reference pricing.",
    intro: [
      "Drug-pricing policy is a concentrated theme: it barely touches most of the market, but for branded-drug makers, biotech, health insurers, and pharmaceutical distributors it is a central channel to revenue and margins. Medicare negotiation, reimbursement rules, and international reference pricing all flow through this group.",
      "The list below is the high-exposure cluster — the pharma and healthcare-payer names where policy shifts move the fundamentals most. The QScore for each is shown for context; the drug-pricing tag measures policy sensitivity, not clinical or competitive standing.",
      POLICY_DISCLAIMER,
    ],
    criteriaLabel: "Policy exposure: drug_pricing = High",
    selector: { type: "predicate", predicate: (p) => policyLevel(p.ticker, "drug_pricing") === "high" },
  },
  {
    slug: "high-antitrust-exposure",
    title: "High Antitrust Exposure Stocks",
    shortDescription:
      "Companies most exposed to antitrust and competition policy — dominant platforms, networks, and concentrated-market operators facing regulatory scrutiny.",
    intro: [
      "Antitrust exposure concentrates at the top of markets: dominant digital platforms, payment networks, and operators with commanding share in concentrated industries. For these companies, competition policy can reshape how they distribute, price, or acquire — a genuine channel to the business rather than background noise.",
      "This is a deliberately short list — only the names where market position makes competition policy a material, first-order consideration clear the bar. The tag reflects exposure to scrutiny, not a finding that any company has done anything wrong.",
      POLICY_DISCLAIMER,
    ],
    criteriaLabel: "Policy exposure: antitrust = High",
    selector: { type: "predicate", predicate: (p) => policyLevel(p.ticker, "antitrust") === "high" },
  },
  {
    slug: "high-china-supply-chain-exposure",
    title: "High China / Supply-Chain Exposure Stocks",
    shortDescription:
      "Companies most exposed to China-linked supply-chain and trade-restriction policy — semiconductors, hardware, and China-sourced goods.",
    intro: [
      "China supply-chain exposure runs deepest in semiconductors and hardware, in retailers whose goods are sourced there, and in industrials with meaningful China manufacturing or sales. For these names, export controls, trade restrictions, and geopolitical friction are a direct operational risk to sourcing, cost, and market access.",
      "The list gathers the highest-exposure names across those groups. As with every QScore category the composite score is shown for context; the tag captures the strength of the China/supply-chain policy channel, not a judgment on the company.",
      POLICY_DISCLAIMER,
    ],
    criteriaLabel: "Policy exposure: china_supply_chain = High",
    selector: { type: "predicate", predicate: (p) => policyLevel(p.ticker, "china_supply_chain") === "high" },
  },
  {
    slug: "high-energy-regulation-exposure",
    title: "High Energy-Regulation Exposure Stocks",
    shortDescription:
      "Companies most exposed to energy and emissions regulation — energy-intensive producers, utilities-adjacent operators, and heavy industrials.",
    intro: [
      "Energy-regulation exposure clusters in the energy-intensive corners of the market: producers and heavy industrials whose economics turn on electricity pricing, emissions rules, and fuel standards, plus businesses whose core operations depend on regulated energy inputs. Policy here moves production costs and capital plans directly.",
      "Below are the highest-exposure names, where energy and emissions policy is a first-order driver rather than a marginal cost line. The QScore is shown for context; the tag reflects regulatory sensitivity, not an environmental rating.",
      POLICY_DISCLAIMER,
    ],
    criteriaLabel: "Policy exposure: energy_regulation = High",
    selector: { type: "predicate", predicate: (p) => policyLevel(p.ticker, "energy_regulation") === "high" },
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
