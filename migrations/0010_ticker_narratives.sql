-- Grounded AI narratives (AI-analysis roadmap, Phase 1).
--
-- One row per (ticker, prompt_version, data_as_of): a structured, analyst-tone
-- narrative generated OFFLINE by scripts/generate-narratives.ts (Anthropic
-- Message Batches API) from a grounding payload assembled STRICTLY from D1
-- (score_snapshots + fundamentals_facts + factor_exposures) plus the committed
-- universe-stats breakpoints. The narrative is never generated at request time;
-- the Worker only reads the latest row for the current prompt_version.
--
-- Idempotency / skip-unchanged: (ticker, prompt_version, data_as_of) is the
-- PRIMARY KEY, so a re-run of the same day is an upsert, not a duplicate. The
-- generator additionally skips a ticker whose input_hash + prompt_version match
-- the stored latest row, so regeneration only happens on a real change
-- (new quarterly fundamentals, a QScore band change, or a prompt_version bump).
--
-- Future phases (reverse DCF, policy-exposure tags, catalyst calendar) attach by
-- adding keys to narrative_json under a bumped prompt_version — no schema change.
--
-- Apply (remote):
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0010_ticker_narratives.sql
-- Apply (local):
--   npx wrangler d1 execute qscoring-db --file=migrations/0010_ticker_narratives.sql

CREATE TABLE IF NOT EXISTS ticker_narratives (
  ticker         TEXT NOT NULL,
  prompt_version TEXT NOT NULL,             -- e.g. "v1"; a bump forces regeneration
  model          TEXT NOT NULL,             -- Anthropic model id used to generate
  narrative_json TEXT NOT NULL,             -- validated Narrative JSON (see lib/narratives/types.ts)
  data_as_of     TEXT NOT NULL,             -- YYYY-MM-DD: snapshot date the grounding used
  score_band     TEXT NOT NULL,             -- e.g. "70-79": composite band, a regen trigger
  input_hash     TEXT NOT NULL,             -- fingerprint of the rounded grounding payload
  generated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, prompt_version, data_as_of)
);

-- Read path: "latest narrative for this ticker at the current prompt_version",
-- i.e. WHERE ticker = ? AND prompt_version = ? ORDER BY data_as_of DESC LIMIT 1.
CREATE INDEX IF NOT EXISTS idx_ticker_narratives_ticker_pv
  ON ticker_narratives(ticker, prompt_version, data_as_of DESC);
