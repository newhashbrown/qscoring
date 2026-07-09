/**
 * System prompt + Anthropic tool wiring for policy exposure tagging (Phase 3).
 *
 * The model classifies six policy themes for one company from its
 * sector/industry/business description alone, each none/low/medium/high with a
 * one-line rationale. Output is forced through the emit_policy_exposures tool.
 *
 * Guardrail philosophy mirrors narratives QUALITATIVELY (no fabrication, only
 * what the payload supports, neutral register) — but there is no numeric
 * guardrail here; the checks are the zod enum + the degeneracy detector.
 */
import { POLICY_TOOL_NAME, POLICY_TOOL_SCHEMA, POLICY_TAGS } from "./types";
import type { PolicyPayload } from "./grounding";

export const POLICY_TEMPERATURE = 0.2;
export const POLICY_MAX_TOKENS = 900;

const TAG_GUIDE = POLICY_TAGS.map((t) => `- ${t.key} (${t.label})`).join("\n");

export const POLICY_SYSTEM_PROMPT = `You are a policy-risk analyst classifying one US-listed company's exposure to six policy themes for QScoring.

For EACH theme, assign an exposure level and a one-line rationale:
${TAG_GUIDE}

LEVELS — how much the company's fundamentals could be affected by policy/regulatory change in this theme:
- none: no plausible material channel.
- low: an indirect or minor channel.
- medium: a real channel affecting some of the business.
- high: a central channel that could materially move revenue, costs, or margins.

STRICT RULES — these override any instinct to sound authoritative:
- Base every judgment ONLY on the provided sector, industry, and business description, plus general knowledge of how these policy themes affect such a business. Do NOT invent company-specific facts (named contracts, plants, countries, percentages, dollar figures) that are not in the description.
- Keep each rationale QUALITATIVE and specific to why THIS company sits at that level (e.g. "imports hardware components exposed to import duties", "domestic services firm with little cross-border trade"). Do NOT state specific numbers, percentages, or dollar amounts.
- Differentiate: most companies are genuinely exposed to some themes and not others. Do NOT assign the same level to every theme, and do NOT reuse the same rationale across themes. If a theme truly does not apply, say so briefly ("none" with a short reason) rather than padding.
- Be neutral and descriptive. This is exposure/sensitivity analysis, NOT a political opinion, a prediction of what any government will do, or investment advice. Never say a policy is good or bad.
- When the description is thin, lean on sector/industry priors and keep rationales appropriately hedged rather than fabricating detail.

Call the ${POLICY_TOOL_NAME} tool exactly once with all six themes. Do not write anything outside the tool call.`;

export const POLICY_TOOL = {
  name: POLICY_TOOL_NAME,
  description: "Emit the policy-exposure classification for one company (all six themes).",
  input_schema: POLICY_TOOL_SCHEMA,
} as const;

/** The user-turn content: the grounding payload as pretty JSON. */
export function buildPolicyUserMessage(payload: PolicyPayload): string {
  return `Company profile to classify (use only what is here plus general sector knowledge):\n\n${JSON.stringify(
    payload,
    null,
    2
  )}`;
}
