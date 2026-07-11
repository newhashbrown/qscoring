/**
 * Coverage classification for a scored ticker.
 *
 * The QScore is built and validated on a specific reference universe —
 * US-listed operating companies above a $2B market cap. A generic factor
 * score can be actively misleading for names outside that universe: ETFs and
 * funds aren't single companies; banks/insurers/REITs are valued on metrics
 * (book value, NIM, FFO) the general model doesn't specialize in; SPACs have
 * no operating fundamentals; micro-caps and freshly-listed names have thin,
 * noisy data. Rather than hide that, every score page shows a coverage badge
 * so the limitation is visible at the point of use.
 *
 * This is a pure function so it's trivially unit-testable; it's computed in
 * lib/scoring/score.ts (which already has the FMP profile + confidence) and
 * carried on ScoreResult, so /score, /compare, and portfolio all inherit it.
 */

export type CoverageState =
  | "in_universe"
  | "approximation"
  | "insufficient_data"
  | "do_not_score";

export type Coverage = {
  state: CoverageState;
  /** Short badge text. */
  label: string;
  /** One-line plain-English explanation for the tooltip/caption. */
  reason: string;
};

export type CoverageInput = {
  /** Ticker symbol — needed to catch mutual-fund share classes whose FMP
   *  isFund/isEtf flags LIE (return false); see MUTUAL_FUND_TICKER below. */
  symbol?: string | null;
  isEtf?: boolean;
  isFund?: boolean;
  isActivelyTrading?: boolean;
  sector?: string | null;
  industry?: string | null;
  marketCap?: number | null;
  /** ISO country code if known; non-US flags an ADR/foreign-listing gap. */
  country?: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
};

// Mutual-fund share-class ticker shape (5 letters ending in X: JMUEX, JUESX,
// JUEZX, AAFTX…). FMP's isFund/isEtf flags return FALSE for these, so the
// ticker shape is the reliable signal — this is the same predicate the snapshot
// universe filter uses (issues #62/#63), applied here so the score PAGE (which
// bypasses the universe filter) also refuses to score them.
const MUTUAL_FUND_TICKER = /^[A-Z]{4}X$/;

// Methodology: reference universe is US-listed equities with market cap above
// this floor (capped at 800 names per refresh).
export const REFERENCE_MIN_MARKET_CAP = 2_000_000_000;

function isBankInsurerOrReit(sector?: string | null, industry?: string | null): boolean {
  const ind = (industry ?? "").toLowerCase();
  const sec = (sector ?? "").toLowerCase();
  // Match on INDUSTRY, not the broad "Financial Services" sector — that sector
  // also holds payment/credit/exchange names (Visa, Mastercard) the generic
  // model handles fine. Only book-value/FFO-driven businesses misfire.
  return (
    /\bbank/.test(ind) ||
    /insurance/.test(ind) ||
    /reit/.test(ind) ||
    sec === "real estate"
  );
}

function isShellOrSpac(industry?: string | null): boolean {
  return /shell|blank check|special purpose/.test((industry ?? "").toLowerCase());
}

export function classifyCoverage(input: CoverageInput): Coverage {
  const { symbol, isEtf, isFund, isActivelyTrading, sector, industry, marketCap, country, confidence } =
    input;

  // 1. Not a single operating company at all → don't pretend to score it.
  //    Check the mutual-fund ticker shape too: FMP's isFund/isEtf flags LIE for
  //    mutual-fund share classes (return false), so the flags alone let JMUEX-
  //    style tickers through to a full (meaningless) score page.
  if (isEtf || isFund || (symbol && MUTUAL_FUND_TICKER.test(symbol.toUpperCase()))) {
    return {
      state: "do_not_score",
      label: "Not scored",
      reason:
        "This is a fund or ETF, not an operating company — the QScore models single-company fundamentals, so it doesn't apply here.",
    };
  }
  if (isShellOrSpac(industry)) {
    return {
      state: "do_not_score",
      label: "Not scored",
      reason:
        "Shell company / SPAC — there are no operating fundamentals to score until it completes a combination.",
    };
  }
  if (isActivelyTrading === false) {
    return {
      state: "do_not_score",
      label: "Not scored",
      reason: "This security isn't actively trading (delisted or halted), so a live score isn't meaningful.",
    };
  }

  // 2. Data too thin for a trustworthy composite — newly listed, pre-revenue,
  //    or sparse fundamentals. The scorer already flags these LOW confidence.
  if (confidence === "LOW") {
    return {
      state: "insufficient_data",
      label: "Insufficient data",
      reason:
        "Too little price history or fundamentals for a reliable score — typical of newly-listed or pre-revenue names. Treat the number as provisional.",
    };
  }

  // 3. Structurally-different financials the generic factor model misfires on.
  if (isBankInsurerOrReit(sector, industry)) {
    return {
      state: "approximation",
      label: "Approximation",
      reason:
        "Banks, insurers, and REITs are valued on metrics the general model doesn't specialize in (book value, NIM, FFO), so this is a rough approximation rather than a tuned read.",
    };
  }

  // 4. Non-US listing (ADR / foreign) — outside the US reference universe.
  //    Only fires when a country is known; the live profile may not supply one.
  if (country && country.toUpperCase() !== "US") {
    return {
      state: "approximation",
      label: "Approximation",
      reason:
        "A non-US company (ADR or foreign listing) — outside the US reference universe, so treat this as an out-of-universe approximation.",
    };
  }

  // 5. Operating company below the reference-universe size floor.
  if (!(typeof marketCap === "number" && marketCap >= REFERENCE_MIN_MARKET_CAP)) {
    return {
      state: "approximation",
      label: "Approximation",
      reason:
        "Below the $2B market-cap floor of the reference universe — small/micro-cap data is thinner and noisier, so this is an out-of-universe approximation.",
    };
  }

  // 6. US-listed operating company, > $2B, ordinary financials → in universe.
  return {
    state: "in_universe",
    label: "In reference universe",
    reason:
      "A US-listed operating company above $2B — squarely inside the universe the QScore is built and validated on.",
  };
}
