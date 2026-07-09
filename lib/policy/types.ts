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

const RationaleSchema = z.string().trim().min(3).max(240);
const ExposureSchema = z.object({
  level: z.enum(POLICY_LEVELS),
  rationale: RationaleSchema,
});

/** zod object keyed by the six tags (all required, unknown keys stripped). */
export const PolicyExposuresSchema = z.object(
  Object.fromEntries(POLICY_TAG_KEYS.map((k) => [k, ExposureSchema])) as Record<
    PolicyTagKey,
    typeof ExposureSchema
  >
);

/**
 * JSON-Schema mirror used as the Anthropic tool `input_schema` so the model is
 * FORCED to emit exactly these keys/types. zod remains the authority on the
 * parsed result.
 */
const EXPOSURE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["level", "rationale"],
  properties: {
    level: { type: "string", enum: [...POLICY_LEVELS] },
    rationale: { type: "string", minLength: 3, maxLength: 240 },
  },
} as const;

export const POLICY_TOOL_NAME = "emit_policy_exposures";
export const POLICY_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...POLICY_TAG_KEYS],
  properties: Object.fromEntries(POLICY_TAG_KEYS.map((k) => [k, EXPOSURE_JSON_SCHEMA])),
} as const;

/** Parse untrusted JSON into PolicyExposures; null on any schema violation. */
export function parsePolicyExposures(raw: unknown): PolicyExposures | null {
  const result = PolicyExposuresSchema.safeParse(raw);
  return result.success ? (result.data as PolicyExposures) : null;
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
