/**
 * Numeric guardrail (AI-analysis roadmap, Phase 1).
 *
 * PURE: extracts every number the model wrote and verifies each is grounded in
 * the payload it was given. A narrative that cites a figure not derivable from
 * the payload is rejected wholesale (logged, never persisted). Unit-tested
 * against near-misses, not just clean input (see validate-numbers.test.ts).
 *
 * Why not string equality? Analysts legitimately reformat the SAME figure:
 * "$394.3B" for 394328 (millions), "46.9%" for the 0.469 fraction, "3.01
 * trillion" for a 3,010,000 (millions) market cap. Each is the payload value
 * times a power of ten. So a cited number is grounded when it equals a payload
 * value up to a power-of-ten UNIT change — but the permitted powers depend on how
 * the number was written, or the invariance becomes too loose (a bare "35" would
 * otherwise match a 0.35 beta via ×100). Concretely:
 *   - money token  ($, or a B/M/T/K suffix) → 10^{0,±3,±6,±9,±12} (unit scale)
 *   - percent token (%/"percent")           → 10^{0,±2} (fraction ↔ percent)
 *   - plain number                          → 10^0 only (same magnitude)
 * Bare small integers ("over 5 years", "third-largest") and 4-digit years present
 * in the payload are whitelisted so ordinary prose counts don't trip the guard.
 */
import type { GroundingPayload } from "./grounding";

export type NumberCategory = "money" | "percent" | "plain";

export type NumberToken = {
  value: number; // absolute value as written
  raw: string; // matched substring, for logging
  category: NumberCategory;
  /** Integer with no %, $, decimal, or magnitude suffix — a prose count/ordinal. */
  bareInteger: boolean;
};

export type OffendingNumber = { section: string; raw: string; value: number };
export type NumberValidation = { ok: boolean; offending: OffendingNumber[] };

const REL_TOL = 0.02; // 2% mantissa tolerance
const SCALES: Record<NumberCategory, number[]> = {
  money: [0, 3, 6, 9, 12, -3, -6, -9, -12],
  percent: [0, 2, -2],
  plain: [0],
};

const NUMBER_RE = /(\$)?\s?(-?\d{1,3}(?:,\d{3})+|-?\d+(?:\.\d+)?)\s?(%|percent|trillion|tn|billion|bn|million|mn|thousand|[a-z])?/gi;
const MAGNITUDE_SUFFIX = new Set(["k", "m", "mn", "b", "bn", "t", "tn", "thousand", "million", "billion", "trillion"]);

/** Extract numeric tokens, classifying each so scale matching stays honest. */
export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const currency = Boolean(m[1]);
    const core = m[2].replace(/,/g, "");
    const value = Number(core);
    if (!Number.isFinite(value)) continue;
    const suffixRaw = (m[3] ?? "").toLowerCase();
    const percent = suffixRaw === "%" || suffixRaw === "percent";
    const hasMagnitude = MAGNITUDE_SUFFIX.has(suffixRaw);
    const hasDecimal = core.includes(".");
    const category: NumberCategory = percent
      ? "percent"
      : currency || hasMagnitude
        ? "money"
        : "plain";
    const bareInteger =
      Number.isInteger(value) && !currency && !percent && !hasMagnitude && !hasDecimal;
    out.push({ value: Math.abs(value), raw: m[0].trim(), category, bareInteger });
  }
  return out;
}

/** True when `value` equals some allowed number under a permitted unit scale. */
export function isGrounded(
  value: number,
  category: NumberCategory,
  allowed: number[]
): boolean {
  if (value === 0) return allowed.includes(0);
  for (const a of allowed) {
    if (a === 0) continue;
    for (const k of SCALES[category]) {
      const scaled = Math.abs(a) * Math.pow(10, k);
      if (Math.abs(value - scaled) <= REL_TOL * scaled) return true;
    }
  }
  return false;
}

/**
 * Every number that appears anywhere in the grounding payload — including numbers
 * embedded in STRING values (e.g. the "70-79" score band, the "2026-07-07" date),
 * since those literally "appear in the payload" and a model may quote them.
 */
export function collectAllowedNumbers(payload: GroundingPayload): number[] {
  const nums: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "number") {
      if (Number.isFinite(v)) nums.push(Math.abs(v));
    } else if (typeof v === "string") {
      for (const tok of extractNumbers(v)) nums.push(tok.value);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(payload);
  return nums;
}

function payloadYears(payload: GroundingPayload): Set<number> {
  const years = new Set<number>();
  for (const y of payload.fundamentals.fiscal_years) {
    const n = Number(y);
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) years.add(n);
  }
  const asOfYear = Number(payload.data_as_of.slice(0, 4));
  if (Number.isInteger(asOfYear)) years.add(asOfYear);
  return years;
}

type NarrativeLike = {
  financial_health: string;
  competitive_position: string;
  factor_macro_profile: string;
  risk_flags: string[];
  catalyst_watch: string[];
  one_line_summary: string;
};

const NARRATIVE_STRING_FIELDS: Array<{ key: string; get: (n: NarrativeLike) => string[] }> = [
  { key: "financial_health", get: (n) => [n.financial_health] },
  { key: "competitive_position", get: (n) => [n.competitive_position] },
  { key: "factor_macro_profile", get: (n) => [n.factor_macro_profile] },
  { key: "risk_flags", get: (n) => n.risk_flags },
  { key: "catalyst_watch", get: (n) => n.catalyst_watch },
  { key: "one_line_summary", get: (n) => [n.one_line_summary] },
];

/**
 * Verify every number in `narrative` is grounded in `payload`. A bare small
 * integer (≤ max(12, #fiscal-years)) or a payload year passes as prose; every
 * other number must match a payload value under a permitted unit scale.
 */
export function validateNarrativeNumbers(
  narrative: NarrativeLike,
  payload: GroundingPayload
): NumberValidation {
  const allowed = collectAllowedNumbers(payload);
  const years = payloadYears(payload);
  const maxCount = Math.max(12, payload.fundamentals.fiscal_years.length);
  const offending: OffendingNumber[] = [];

  for (const field of NARRATIVE_STRING_FIELDS) {
    for (const text of field.get(narrative)) {
      for (const tok of extractNumbers(text)) {
        if (tok.bareInteger && (tok.value <= maxCount || years.has(tok.value))) continue;
        if (Number.isInteger(tok.value) && years.has(tok.value)) continue;
        if (isGrounded(tok.value, tok.category, allowed)) continue;
        offending.push({ section: field.key, raw: tok.raw, value: tok.value });
      }
    }
  }

  return { ok: offending.length === 0, offending };
}
