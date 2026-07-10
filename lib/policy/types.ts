/**
 * Policy exposure tagging — taxonomy, schema, and quality guards (Phase 3).
 *
 * A classification of a company's exposure to six policy themes, each scored
 * none/low/medium/high with a one-line rationale, generated offline from the
 * company's sector/industry/business description. Validated with zod at two
 * points: when the generator parses the model's tool output, and again
 * defensively when the read path deserializes a stored row.
 *
 * Guardrails vs Phase 1: the narratives pipeline's NUMERIC guardrail does not
 * apply here — the output is categorical (a `level` enum) plus a short
 * qualitative rationale, which has essentially no numeric content to match. What
 * carries over is the pipeline INFRA (batch/retry/input_hash/skip-unchanged) and
 * the qualitative anti-fabrication prompt rules; the quantitative check is
 * replaced by `degenerateReason` (see below), which targets the failure mode a
 * per-ticker classifier actually produces: rubber-stamping every tag the same.
 */
import { z } from "zod";

/** Bump to force regeneration + invalidate stored classifications on read. */
export const POLICY_PROMPT_VERSION = "v1";

/** The seed taxonomy. Order here is the canonical display + iteration order. */
export const POLICY_TAGS = [
  { key: "tariffs", label: "Tariffs" },
  { key: "drug_pricing", label: "Drug Pricing" },
  { key: "tax_policy", label: "Tax Policy" },
  { key: "energy_regulation", label: "Energy Regulation" },
  { key: "antitrust", label: "Antitrust" },
  { key: "china_supply_chain", label: "China / Supply Chain" },
] as const;

export type PolicyTagKey = (typeof POLICY_TAGS)[number]["key"];
export const POLICY_TAG_KEYS = POLICY_TAGS.map((t) => t.key) as PolicyTagKey[];
export const POLICY_TAG_LABEL: Record<PolicyTagKey, string> = Object.fromEntries(
  POLICY_TAGS.map((t) => [t.key, t.label])
) as Record<PolicyTagKey, string>;

/** Ordered exposure levels; LEVEL_RANK drives sorting + badge coloring. */
export const POLICY_LEVELS = ["none", "low", "medium", "high"] as const;
export type PolicyLevel = (typeof POLICY_LEVELS)[number];
export const LEVEL_RANK: Record<PolicyLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

export type PolicyExposure = { level: PolicyLevel; rationale: string };
export type PolicyExposures = Record<PolicyTagKey, PolicyExposure>;

// Raised from 240: the most policy-dense names (e.g. Pfizer) legitimately run
// longer per theme. The prompt still asks for ~40 words to keep the UI tidy;
// this cap is the hard ceiling, not the target.
export const MAX_RATIONALE_CHARS = 480;
const RationaleSchema = z.string().trim().min(3).max(MAX_RATIONALE_CHARS);

// Level normalized before the enum check: Haiku occasionally returns "High" /
// "NONE " / " medium" — trim + lowercase so casing/whitespace doesn't reject an
// otherwise-valid classification (this was AAPL's valid-JSON-but-rejected case).
const LevelSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.enum(POLICY_LEVELS)
);

const ExposureSchema = z.object({
  level: LevelSchema,
  rationale: RationaleSchema,
});

/**
 * Nested schema — the STORAGE + read/UI shape (one key per tag holding
 * {level, rationale}). This is what persist-policy-tags validates and what
 * exposures_json holds. The MODEL does not emit this shape directly; see the
 * FLAT tool schema + parsePolicyToolOutput below.
 */
export const PolicyExposuresSchema = z.object(
  Object.fromEntries(POLICY_TAG_KEYS.map((k) => [k, ExposureSchema])) as Record<
    PolicyTagKey,
    typeof ExposureSchema
  >
);

export const POLICY_TOOL_NAME = "emit_policy_exposures";

// Flat field names, two per tag: `${tag}_level` + `${tag}_rationale`.
export const levelField = (k: PolicyTagKey) => `${k}_level` as const;
export const rationaleField = (k: PolicyTagKey) => `${k}_rationale` as const;

/**
 * FLAT JSON-Schema tool mirror. A nested object-of-objects schema makes Haiku
 * leak tool-call scaffolding (literal `<parameter name="level">` strings, fields
 * hoisted to siblings, the call split across multiple tool_use blocks). A flat
 * schema of 12 scalar fields serializes far more reliably; parsePolicyToolOutput
 * reassembles it into the nested storage shape.
 */
export const POLICY_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: POLICY_TAG_KEYS.flatMap((k) => [levelField(k), rationaleField(k)]),
  properties: Object.fromEntries(
    POLICY_TAG_KEYS.flatMap((k) => [
      [levelField(k), { type: "string", enum: [...POLICY_LEVELS] }],
      [rationaleField(k), { type: "string", minLength: 3, maxLength: MAX_RATIONALE_CHARS }],
    ])
  ),
} as const;

/** zod for the FLAT tool output: 12 fields, level normalized, unknown stripped. */
export const FlatPolicyOutputSchema = z.object(
  Object.fromEntries(
    POLICY_TAG_KEYS.flatMap((k) => [
      [levelField(k), LevelSchema],
      [rationaleField(k), RationaleSchema],
    ])
  ) as Record<string, typeof LevelSchema | typeof RationaleSchema>
);

/** Parse the STORED (nested) shape; null on any schema violation. */
export function parsePolicyExposures(raw: unknown): PolicyExposures | null {
  const result = PolicyExposuresSchema.safeParse(raw);
  return result.success ? (result.data as PolicyExposures) : null;
}

/** Reassemble validated flat fields into the nested storage shape. */
function flatToNested(flat: Record<string, unknown>): PolicyExposures {
  const out = {} as PolicyExposures;
  for (const k of POLICY_TAG_KEYS) {
    out[k] = {
      level: flat[levelField(k)] as PolicyLevel,
      rationale: flat[rationaleField(k)] as string,
    };
  }
  return out;
}

/**
 * Merge the `input` of ALL tool_use blocks in a message. Haiku sometimes splits
 * one forced tool call across several tool_use blocks; taking only the first
 * would drop fields, so we shallow-merge them (unknown keys are stripped by the
 * flat schema during parse).
 */
export function mergeToolUseInputs(
  content: ReadonlyArray<{ type: string; input?: unknown }>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const b of content) {
    if (b.type === "tool_use" && b.input && typeof b.input === "object") {
      Object.assign(merged, b.input as Record<string, unknown>);
    }
  }
  return merged;
}

/**
 * Parse the model's FLAT tool output into the nested PolicyExposures. Returns
 * the value plus the zod error (when it fails) so callers can log exactly what
 * tripped validation.
 */
export function parsePolicyToolOutput(
  raw: unknown
): { value: PolicyExposures | null; error: z.ZodError | null } {
  const result = FlatPolicyOutputSchema.safeParse(raw);
  if (!result.success) return { value: null, error: result.error };
  return { value: flatToNested(result.data as Record<string, unknown>), error: null };
}

/**
 * Detect a degenerate classification — the failure mode a per-ticker classifier
 * actually produces: rubber-stamping every tag identically or copy-pasting one
 * rationale. Returns a human reason string when degenerate, else null.
 *
 * Deliberately NOT flagged: all-"none" with six DISTINCT rationales is a
 * legitimate "no material exposure, because X per theme" result for a genuinely
 * unexposed company — only a uniform NON-none level (all-high/all-medium/all-low)
 * is implausible enough to reject. Lazy all-"none" gets caught instead by the
 * duplicate-rationale rule, which fires regardless of level.
 */
export function degenerateReason(ex: PolicyExposures): string | null {
  const entries = POLICY_TAG_KEYS.map((k) => ex[k]);
  const levels = entries.map((e) => e.level);
  if (new Set(levels).size === 1 && levels[0] !== "none") {
    return `all six levels identical (${levels[0]})`;
  }
  const norm = entries.map((e) => e.rationale.trim().toLowerCase());
  const counts = new Map<string, number>();
  for (const r of norm) counts.set(r, (counts.get(r) ?? 0) + 1);
  const maxDup = Math.max(...counts.values());
  if (maxDup >= 3) return `same rationale reused ${maxDup}×`;
  return null;
}

export const isDegenerate = (ex: PolicyExposures): boolean => degenerateReason(ex) !== null;
