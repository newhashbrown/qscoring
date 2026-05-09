/**
 * Translates a confidence label + the inputs that produced it into a
 * human-readable sentence. The bare HIGH/MEDIUM/LOW label tells users
 * very little; the reason explains *why* and is what builds trust.
 *
 * Thresholds mirror deriveConfidence() in score.ts so the two stay in
 * sync — when those thresholds change, update both files.
 */
import type { CategoryScore, Confidence } from "./types";

const COMPLETENESS_HIGH = 0.85;
const COMPLETENESS_MEDIUM = 0.75;
const COMPLETENESS_LOW = 0.6;
const DECISIVE_HIGH = 70;
const DECISIVE_LOW = 30;

export function confidenceReason(
  confidence: Confidence,
  composite: number,
  categories: CategoryScore[]
): string {
  const completeness =
    categories.reduce((s, c) => s + c.completeness, 0) / categories.length;
  const completenessPct = Math.round(completeness * 100);
  const decisive = composite >= DECISIVE_HIGH || composite <= DECISIVE_LOW;
  const compositeRounded = Math.round(composite);

  // Also identify any category with very poor data — drives a low rating
  // even when the universe-wide completeness looks OK.
  const weakest = [...categories].sort((a, b) => a.completeness - b.completeness)[0];
  const weakestPct = weakest ? Math.round(weakest.completeness * 100) : 100;

  if (confidence === "HIGH") {
    return `${completenessPct}% data completeness across all factors and the composite score (${compositeRounded}) is in decisive ${
      composite >= DECISIVE_HIGH ? "buy" : "short"
    } territory.`;
  }

  if (confidence === "MEDIUM") {
    if (!decisive) {
      return `${completenessPct}% data completeness, but the composite (${compositeRounded}) sits in the indecisive ${DECISIVE_LOW}–${DECISIVE_HIGH} range — strong-buy and short calls require a more decisive composite.`;
    }
    return `${completenessPct}% data completeness — some metrics missing, but enough coverage to call the signal.`;
  }

  // LOW
  if (completeness < COMPLETENESS_LOW) {
    return `Only ${completenessPct}% of metrics returned data — too many gaps to score with confidence.`;
  }
  if (weakest && weakest.completeness < 0.5) {
    return `Insufficient data on the ${weakest.label.toLowerCase()} factor (only ${weakestPct}% of metrics available) — composite is computed but not reliable.`;
  }
  return `${completenessPct}% data completeness with at least one factor category lacking enough metrics to score reliably.`;
}
