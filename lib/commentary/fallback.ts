/**
 * Deterministic commentary fallback for when the AI generation path fails
 * or times out. Produces ticker-specific factual prose from the structured
 * score so every page has unique text content even when the AI binding is
 * unavailable — no more thin-content "QScore Analysis" sections.
 *
 * The fallback is deliberately mechanical (no opinion, no forecast) so it
 * can ship on every page without sounding like generic boilerplate.
 */

import type { CategoryName, ScoreResult, Signal } from "@/lib/scoring";

const SIGNAL_PHRASE: Record<Signal, string> = {
  BUY_LONG_TERM: "a Buy Long-Term signal",
  BUY_SHORT_TERM: "a Buy Short-Term signal",
  HOLD: "a Hold signal",
  SHORT: "a Short signal",
};

const SIGNAL_REASON: Record<Signal, string> = {
  BUY_LONG_TERM:
    "the long-term composite cleared the buy threshold, weighting fundamentals over technicals",
  BUY_SHORT_TERM:
    "the short-term composite cleared the buy threshold on the back of strong momentum",
  HOLD:
    "neither the long-term nor the short-term composite cleared a buy threshold",
  SHORT:
    "at least one of the long-term and short-term composites fell below the short threshold",
};

const CATEGORY_LABEL: Record<CategoryName, string> = {
  value: "value",
  growth: "growth",
  momentum: "momentum",
  profitability: "profitability",
  risk: "risk",
};

function rankCategories(score: ScoreResult): { strongest: string; weakest: string } {
  const ranked = [...score.categories].sort((a, b) => b.score - a.score);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  return {
    strongest: `${CATEGORY_LABEL[strongest.name]} (${Math.round(strongest.score)})`,
    weakest: `${CATEGORY_LABEL[weakest.name]} (${Math.round(weakest.score)})`,
  };
}

export function fallbackCommentary(score: ScoreResult): string {
  const { strongest, weakest } = rankCategories(score);
  const composite = Math.round(score.composite);
  const lt = Math.round(score.longTermScore);
  const st = Math.round(score.shortTermScore);
  const confidence = score.confidence.toLowerCase();

  return (
    `${score.ticker} has a composite QScore of ${composite}/100 with ` +
    `${SIGNAL_PHRASE[score.signal]} at ${confidence} confidence. ` +
    `The strongest factor is ${strongest}; the weakest is ${weakest}. ` +
    `Long-term score sits at ${lt} and short-term at ${st} — ` +
    `${SIGNAL_REASON[score.signal]}.`
  );
}
