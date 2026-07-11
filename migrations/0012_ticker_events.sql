-- Catalyst calendar (AI-analysis roadmap, Phase 4).
--
-- Upcoming corporate events per ticker — earnings, ex-dividend dates, and stock
-- splits — ingested daily from FMP calendars by scripts/build-events.ts and
-- surfaced in the per-ticker "Upcoming Catalysts" component (merged with the
-- Phase 1 narrative catalyst_watch).
--
-- The table holds ONLY upcoming events: the daily ingest is a FULL REPLACE of the
-- future window (DELETE future + INSERT), not a date-keyed upsert. FMP routinely
-- reschedules earnings dates, so keying by (ticker, event_type, event_date) and
-- upserting would leave the old date lingering as a phantom "upcoming earnings"
-- (the same class of bug as the HON split-phantom). Replace-future makes
-- rescheduled and canceled events disappear correctly.
--
-- Apply (remote):
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0012_ticker_events.sql
-- Apply (local):
--   npx wrangler d1 execute qscoring-db --file=migrations/0012_ticker_events.sql

CREATE TABLE IF NOT EXISTS ticker_events (
  ticker       TEXT NOT NULL,
  event_type   TEXT NOT NULL,             -- 'earnings' | 'ex_dividend' | 'split'
  event_date   TEXT NOT NULL,             -- YYYY-MM-DD (earnings date / ex-div date / split date)
  details_json TEXT,                      -- {epsEstimated,revenueEstimated} | {dividend,paymentDate} | {numerator,denominator}
  source       TEXT NOT NULL DEFAULT 'fmp',
  ingested_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, event_type, event_date)
);

-- Read path: "upcoming events for this ticker", i.e. WHERE ticker = ? AND
-- event_date >= ? ORDER BY event_date.
CREATE INDEX IF NOT EXISTS idx_ticker_events_ticker_date
  ON ticker_events(ticker, event_date);
