-- Stale-while-error cache for FMP responses. On a successful live fetch the
-- payload is upserted here; when a live fetch fails with a transient error
-- (429-exhausted, 5xx, network), fmpGet falls back to the last-known-good
-- row instead of throwing. Cache_key is endpoint-scoped (e.g. "quote:AAPL",
-- "ratiosTtm:NVDA") so cross-endpoint payloads can never collide.
--
-- Apply with:
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0003_fmp_cache.sql
CREATE TABLE IF NOT EXISTS fmp_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fmp_cache_fetched ON fmp_cache(fetched_at);
