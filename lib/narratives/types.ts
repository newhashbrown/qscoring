/**
 * Grounded AI narratives — schema + versioning (AI-analysis roadmap, Phase 1).
 *
 * The narrative is a small, fixed set of analyst-tone sections generated offline
 * from a D1-derived grounding payload. It is validated with zod at two points:
 * once when the generator parses the model's tool output, and again defensively
 * when the read route deserializes a stored row. Bumping NARRATIVE_PROMPT_VERSION
 * invalidates every stored narrative for read purposes and forces regeneration.
 *
 * Free vs paid: `financial_health` (+ the always-shown "As of" / disclaimer
 * chrome) is the free-tier teaser; every other section is paid. FREE_SECTIONS is
 * the single source of truth for that split — the read route and the UI both use
 * it, so the gate can never drift between server and client.
 */
import { z } from "zod";

/** Bump to force regeneration + invalidate stored narratives on read. */
export const NARRATIVE_PROMPT_VERSION = "v1";

// Bounds are deliberately generous and the object is NON-strict: LLM tool output
// routinely runs a little long or adds a stray key, and z.object() strips unknown
// keys by default (whereas .strict() would REJECT the whole narrative over one
// extra field). We validate shape + sane length, not exact byte counts.
const Section = z.string().trim().min(10).max(2400);
const ShortItem = z.string().trim().min(3).max(320);

export const NarrativeSchema = z.object({
  financial_health: Section,
  competitive_position: Section,
  factor_macro_profile: Section,
  risk_flags: z.array(ShortItem).min(1).max(8),
  catalyst_watch: z.array(ShortItem).min(1).max(8),
  one_line_summary: z.string().trim().min(8).max(400),
});

export type Narrative = z.infer<typeof NarrativeSchema>;

/** Ordered section keys, for stable rendering. */
export const NARRATIVE_SECTIONS = [
  "financial_health",
  "competitive_position",
  "factor_macro_profile",
  "risk_flags",
  "catalyst_watch",
  "one_line_summary",
] as const;

/** Sections visible without a paid subscription. Everything else is gated. */
export const FREE_SECTIONS: ReadonlySet<keyof Narrative> = new Set(["financial_health"]);

/**
 * JSON-Schema mirror of NarrativeSchema, used as the Anthropic tool `input_schema`
 * so the model is FORCED to emit exactly these keys/types. Forcing the tool makes
 * parse failures rare; zod is still the authority on the parsed result.
 */
export const NARRATIVE_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "financial_health",
    "competitive_position",
    "factor_macro_profile",
    "risk_flags",
    "catalyst_watch",
    "one_line_summary",
  ],
  properties: {
    financial_health: { type: "string", minLength: 20, maxLength: 1200 },
    competitive_position: { type: "string", minLength: 20, maxLength: 1200 },
    factor_macro_profile: { type: "string", minLength: 20, maxLength: 1200 },
    risk_flags: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
    catalyst_watch: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
    one_line_summary: { type: "string", minLength: 10, maxLength: 240 },
  },
} as const;

export const NARRATIVE_TOOL_NAME = "emit_narrative";

/** Parse untrusted JSON into a Narrative; returns null on any schema violation. */
export function parseNarrative(raw: unknown): Narrative | null {
  const result = NarrativeSchema.safeParse(raw);
  return result.success ? result.data : null;
}
