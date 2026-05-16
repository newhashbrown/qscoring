-- Queryable per-ticker score history. Mirrors data/snapshots/YYYY-MM-DD.json
-- so /performance and future history charts can read by ticker without
-- scanning every snapshot file. Append-only by convention; primary key
-- makes daily re-runs idempotent (a same-day rerun upserts the row).
--
-- Apply with:
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0004_score_snapshots.sql
CREATE TABLE IF NOT EXISTS score_snapshots (
  ticker          TEXT NOT NULL,
  snapshot_date   TEXT NOT NULL,            -- YYYY-MM-DD, US market close (ET)
  composite       REAL NOT NULL,
  long_term       REAL NOT NULL,
  short_term      REAL NOT NULL,
  signal          TEXT NOT NULL,            -- BUY_LONG_TERM | BUY_SHORT_TERM | HOLD | SHORT
  confidence      TEXT NOT NULL,            -- HIGH | MEDIUM | LOW
  price           REAL NOT NULL,
  change_percent  REAL NOT NULL,
  company_name    TEXT NOT NULL,
  categories_json TEXT NOT NULL,            -- CategoryScore[] (name,label,score)
  model_version   TEXT,                     -- e.g. v0.3; NULL for pre-D1 backfills
  generated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, snapshot_date)
);

-- Leaderboard reads: "everything on day X, sorted by composite."
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON score_snapshots(snapshot_date);

-- Ticker history reads: "last N days for ticker X."
CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_date
  ON score_snapshots(ticker, snapshot_date DESC);
