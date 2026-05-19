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

/**
 * Words that match the ticker regex (all-caps, 1-10 chars) but are
 * never valid ticker symbols — they're brokerage UI vocabulary that
 * gets accidentally pasted with table data. Filtering these out
 * prevents the parser from treating "Total" / "Trade" / "Cash" as
 * tickers and trying to score them.
 *
 * Real one-letter tickers (T = AT&T, F = Ford, M = Macy's, U = Unity)
 * and common short tickers stay safe — only words specifically used as
 * brokerage UI labels are listed here.
 */
const NOT_A_TICKER = new Set([
  // Action / button labels
  "TRADE", "BUY", "SELL", "TRANSFER", "ALERTS", "ALERT", "NOTIFY",
  "ACTIONS", "ACTION", "ORDER", "ORDERS",
  // Aggregate / summary rows
  "TOTAL", "TOTALS", "SUBTOTAL", "SUM", "GRAND",
  // Account labels
  "CASH", "EQUITY", "MARGIN", "ACCOUNT", "BALANCE", "BUYING", "POWER",
  // Column headers
  "SYMBOL", "TICKER", "NAME", "PRICE", "QUANTITY", "QTY", "SHARES",
  "WEIGHT", "VALUE", "GAIN", "LOSS", "CHANGE", "DAY", "DAYS", "PAID",
  "AVERAGE", "AVG", "POSITION", "POSITIONS", "LAST",
  // Section headers / counts
  "VIEWING", "SHOWING", "PORTFOLIO", "HOLDINGS", "STOCKS", "ETFS",
  // Common English in brokerage tables
  "MONEY", "OPEN", "CLOSED", "FILLED", "PENDING",
]);

/**
 * What the second number on each input line means. Drives both parsing
 * and the post-scoring weight derivation in the API route.
 */
export type PortfolioMode = "equal" | "weights" | "shares" | "values";

export type PortfolioInputEntry = {
  ticker: string;
  /** The second number on the input line, interpreted per the mode. */
  rawNumber?: number;
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
 *   "AAPL 10 195.40 ..."   ← brokerage paste; we take the FIRST number
 *
 * Lines starting with # are treated as comments and skipped. Currency
 * symbols and thousand-separator commas inside numbers are stripped.
 *
 * The second number's *meaning* (weight / shares / dollar value) is
 * decided at analysis time by the mode the user picked in the UI — the
 * parser just captures the raw number.
 */
export function parsePortfolioInput(text: string, mode: PortfolioMode = "weights"): PortfolioParsed {
  const errors: string[] = [];
  const entries: PortfolioInputEntry[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;

    // Strip leading $ and intra-number commas (1,353.14 → 1353.14), then
    // collapse all separators (commas, tabs, spaces, percent signs) into
    // single spaces so brokerage-paste rows tokenize cleanly.
    const cleaned = raw
      .replace(/(\d),(?=\d{3}\b)/g, "$1") // 1,353.14 → 1353.14
      .replace(/\$/g, "")
      .replace(/[,\t]/g, " ")
      .replace(/%/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = cleaned.split(" ").filter(Boolean);
    const ticker = parts[0]?.toUpperCase();

    if (!ticker || ticker.length < MIN_TICKER_LEN || ticker.length > MAX_TICKER_LEN) {
      // Silently skip — most likely a header / blank-ish line.
      continue;
    }
    if (!TICKER_RE.test(ticker)) {
      // Silently skip — non-ticker text on the line.
      continue;
    }
    if (NOT_A_TICKER.has(ticker)) {
      // Brokerage UI text accidentally pasted (Trade, Total, Cash, etc.).
      // Skip silently so a typical brokerage paste with header rows and
      // button cells just works.
      continue;
    }
    if (seen.has(ticker)) {
      // Duplicate ticker — skip without emitting an error so brokerage
      // pastes that repeat the symbol on multiple lines still parse.
      continue;
    }

    // Equal-weight mode ignores any number on the line — only the ticker
    // matters. For the other three modes, pick the right column from the
    // tokens. The picker is mode-aware so a brokerage row paste works:
    //   - Shares: first INTEGER token (Qty column is typically an integer
    //     like 6, 50, 1000 while everything around it has decimals)
    //   - Values: LARGEST positive number (Value$ column is typically the
    //     biggest dollar amount on the row)
    //   - Weights: only meaningful with clean 2-column input — falls back
    //     to first positive number for ambiguous multi-col pasts
    let rawNumber: number | undefined;
    if (mode !== "equal") {
      const positiveNums = parts
        .slice(1)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);

      if (positiveNums.length === 0) {
        // No usable number — for shares/values/weights modes a line
        // without a number is most likely brokerage text rather than a
        // genuine entry. Skip silently rather than fill it in.
        continue;
      } else if (positiveNums.length === 1) {
        rawNumber = positiveNums[0];
      } else if (mode === "shares") {
        // Find the first integer-valued positive number — that's almost
        // always the Qty column. Fall back to the first number if there's
        // no integer (rare; fractional-share portfolios).
        const firstInt = positiveNums.find((n) => Number.isInteger(n));
        rawNumber = firstInt !== undefined ? firstInt : positiveNums[0];
      } else if (mode === "values") {
        // The position-value column is the largest number on a typical
        // brokerage row.
        rawNumber = Math.max(...positiveNums);
      } else {
        // weights mode with ambiguous multi-column input: first number.
        rawNumber = positiveNums[0];
      }
    }

    seen.add(ticker);
    entries.push({ ticker, rawNumber });

    if (entries.length >= MAX_PORTFOLIO_ENTRIES) {
      errors.push(
        `Capped at ${MAX_PORTFOLIO_ENTRIES} entries — extras after line ${i + 1} ignored`
      );
      break;
    }
  }

  return { entries, errors };
}

/**
 * Convert per-entry raw numbers into normalized weights that sum to 1.0.
 * The raw number's interpretation depends on mode:
 *   - "equal":   ignore any number; equal weight per entry
 *   - "weights": use raw number as weight directly (then normalize)
 *   - "shares":  multiply rawShares × currentPrice (passed in priceFor) to
 *                get position value, then normalize over the portfolio
 *   - "values":  use raw number as dollar position value, then normalize
 *
 * For shares mode, priceFor() must be a synchronous lookup callable —
 * supplied by the API route after each ticker has been scored.
 */
export function deriveWeights(
  entries: PortfolioInputEntry[],
  mode: PortfolioMode,
  priceFor?: (ticker: string) => number | null
): Array<{ ticker: string; weight: number }> {
  if (entries.length === 0) return [];

  // Equal mode: trivial.
  if (mode === "equal") {
    const w = 1 / entries.length;
    return entries.map((e) => ({ ticker: e.ticker, weight: w }));
  }

  // Compute a "score" per entry whose meaning depends on mode. Then
  // normalize over entries with positive scores; entries with no usable
  // score get the average of the rest so they don't drop out silently.
  const scores: Array<{ ticker: string; raw: number | null }> = entries.map((e) => {
    if (e.rawNumber === undefined) return { ticker: e.ticker, raw: null };
    if (mode === "weights" || mode === "values") {
      return { ticker: e.ticker, raw: e.rawNumber };
    }
    // shares mode
    const price = priceFor?.(e.ticker);
    if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) {
      return { ticker: e.ticker, raw: null };
    }
    return { ticker: e.ticker, raw: e.rawNumber * price };
  });

  const explicit = scores.filter((s): s is { ticker: string; raw: number } => s.raw !== null);
  if (explicit.length === 0) {
    // No usable numbers — fall back to equal weight so the user sees
    // something rather than an empty analysis.
    const w = 1 / entries.length;
    return entries.map((e) => ({ ticker: e.ticker, weight: w }));
  }
  const explicitMean = explicit.reduce((s, e) => s + e.raw, 0) / explicit.length;

  const filled = scores.map((s) => ({
    ticker: s.ticker,
    raw: s.raw ?? explicitMean,
  }));
  const total = filled.reduce((s, e) => s + e.raw, 0);
  return filled.map((e) => ({ ticker: e.ticker, weight: e.raw / total }));
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
  // Older snapshots predate the scoreboard carrying sector; fall back to
  // "Unknown" so the UI never renders an empty group.
  return p.sector ?? "Unknown";
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
