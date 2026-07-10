-- Policy exposure tagging (AI-analysis roadmap, Phase 3).
--
-- One row per (ticker, prompt_version): a structured classification of the
-- company's exposure to six policy themes (tariffs, drug pricing, tax policy,
-- energy regulation, antitrust, china/supply-chain), each scored
-- none/low/medium/high with a one-line rationale. Generated OFFLINE by
-- scripts/generate-policy-tags.ts (Anthropic Message Batches API) from a
-- grounding payload assembled from the company's sector/industry/business
-- description (FMP profile). Never generated at request time; the Worker/UI only
-- reads the latest row for the current prompt_version.
--
-- Idempotency / skip-unchanged: (ticker, prompt_version) is the PRIMARY KEY, so a
-- re-run is an upsert, not a duplicate. The generator additionally skips a ticker
-- whose input_hash + prompt_version match the stored row, so regeneration only
-- happens on a real change (a new business description / sector reclassification,
-- or a prompt_version bump). Unlike narratives there is NO data_as_of in the key:
-- policy exposure is slow-moving profile data, not a daily snapshot.
--
-- Apply (remote):
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0011_policy_exposures.sql
-- Apply (local):
--   npx wrangler d1 execute qscoring-db --file=migrations/0011_policy_exposures.sql

CREATE TABLE IF NOT EXISTS policy_exposures (
  ticker         TEXT NOT NULL,
  prompt_version TEXT NOT NULL,             -- e.g. "v1"; a bump forces regeneration
  model          TEXT NOT NULL,             -- Anthropic model id used to classify
  exposures_json TEXT NOT NULL,             -- validated PolicyExposures JSON (lib/policy/types.ts)
  input_hash     TEXT NOT NULL,             -- fingerprint of {sector, industry, description}
  data_as_of     TEXT NOT NULL,             -- YYYY-MM-DD: date the classification grounding was built
  classified_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, prompt_version)
);

-- Read path: "policy exposure for this ticker at the current prompt_version".
CREATE INDEX IF NOT EXISTS idx_policy_exposures_ticker_pv
  ON policy_exposures(ticker, prompt_version);
