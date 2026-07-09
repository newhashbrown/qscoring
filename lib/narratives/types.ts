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
const ShortItem = z.string().trim().min(1).max(320);

/**
 * Coerce a list field to an array of strings. Haiku (like most models) is
 * inconsistent about array fields in tool output: it may return a single
 * newline/semicolon/bullet-delimited STRING, a JSON-encoded array string, or an
 * array of `{...}` objects instead of an array of plain strings. Rather than
 * reject an otherwise-good narrative, normalize all of those to `string[]`.
 */
function toStringList(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const pick = o.text ?? o.flag ?? o.item ?? o.value ?? o.description ?? Object.values(o)[0];
          return typeof pick === "string" ? pick : JSON.stringify(item);
        }
        return String(item);
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[")) {
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr)) return toStringList(arr);
      } catch {
        /* fall through to delimiter split */
      }
    }
    return t
      .split(/\r?\n|;|•|·/)
      .map((s) => s.replace(/^[\s\-*•·]+/, "").replace(/^\d+[.)]\s*/, "").trim())
      .filter(Boolean);
  }
  return v;
}

// Coerce shape AND tolerate a missing/empty list: the model sometimes omits one
// of these fields, and an absent risk/catalyst list shouldn't sink an otherwise
// good narrative (the paragraph sections carry the substance; the UI just hides
// an empty list). It still caps at 8 to reject a runaway.
const ShortItemList = z
  .preprocess((v) => toStringList(v ?? []), z.array(ShortItem).max(8))
  .default([]);

export const NarrativeSchema = z.object({
  financial_health: Section,
  competitive_position: Section,
  factor_macro_profile: Section,
  risk_flags: ShortItemList,
  catalyst_watch: ShortItemList,
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
