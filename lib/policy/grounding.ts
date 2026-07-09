/**
 * Policy-classification grounding payload (Phase 3).
 *
 * PURE: takes an already-fetched company profile (sector/industry/description
 * from FMP) and returns the exact JSON the model is grounded on, plus an
 * `input_hash` for skip-unchanged. No I/O here (unit-testable); the route
 * app/api/cron/policy-grounding does the FMP fetch and calls this.
 *
 * input_hash is taken over ONLY {sector, industry, description} — the
 * slow-moving profile facts that actually determine policy exposure. A daily
 * re-run therefore skips every unchanged ticker; a sector reclassification or a
 * rewritten business description flips the hash and triggers a real regen.
 *
 * The hash helper is the same dependency-free cyrb53 `stableHash` the narratives
 * pipeline uses (identical in Worker, script, and tests) — reused, not
 * duplicated, so the two pipelines can't drift.
 */
import { stableHash } from "@/lib/narratives/grounding";

/** Business description gets capped so a pathological FMP blob can't bloat the batch. */
export const MAX_DESCRIPTION_CHARS = 2000;

export type PolicyProfileInput = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
};

export type PolicyPayload = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  business_description: string | null;
};

export type PolicyGroundingResult = {
  payload: PolicyPayload;
  inputHash: string;
};

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

export function buildPolicyPayload(input: PolicyProfileInput): PolicyGroundingResult {
  const sector = clean(input.sector);
  const industry = clean(input.industry);
  const description = clean(input.description)?.slice(0, MAX_DESCRIPTION_CHARS) ?? null;

  const payload: PolicyPayload = {
    ticker: input.ticker,
    company_name: clean(input.companyName),
    sector,
    industry,
    business_description: description,
  };

  // Hash the profile facts that determine exposure — company_name is excluded
  // (a rename shouldn't churn regen).
  const inputHash = stableHash({ sector, industry, description });
  return { payload, inputHash };
}
