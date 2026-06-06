-- Movers vs. Fundamentals — queryable projection of the daily movers board.
-- The committed JSON at data/movers/<date>.json is the source of truth the
-- /movers UI reads; this table is a denormalized projection for ad-hoc queries
-- and the backtest. NEVER read at request time. Append-only by convention; the
-- primary key makes daily re-runs idempotent (a same-day rerun upserts).
--
-- Anti-lookahead: score_date is always strictly before snapshot_date — the
-- model fields below are the prior snapshot's read, set against the move on
-- snapshot_date.
--
-- Apply with (DO NOT run against remote without explicit sign-off):
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0006_movers.sql
CREATE TABLE IF NOT EXISTS movers (
  snapshot_date        TEXT NOT NULL,   -- move day T (YYYY-MM-DD, US close ET)
  ticker               TEXT NOT NULL,
  company_name         TEXT NOT NULL,
  sector               TEXT,
  side                 TEXT NOT NULL,   -- 'gainer' | 'loser'
  day_return_pct       REAL NOT NULL,   -- change_percent verbatim
  close                REAL NOT NULL,
  prev_close           REAL,
  volume               REAL,
  dollar_volume        REAL,
  -- Prior-snapshot model view (anti-lookahead). NULL when the ticker had no
  -- score on record strictly before T.
  score_date           TEXT,            -- prior snapshot date actually used (< snapshot_date)
  prior_composite      REAL,
  prior_signal         TEXT,            -- BUY_LONG_TERM | BUY_SHORT_TERM | HOLD | SHORT
  factor_value         REAL,
  factor_growth        REAL,
  factor_momentum      REAL,
  factor_profitability REAL,
  factor_risk          REAL,
  alignment            TEXT NOT NULL,   -- confirmed_strength | unsupported_pop | unscored_pop
                                        -- | confirmed_weakness | dislocation | unscored_drop
  alignment_note       TEXT NOT NULL,
  generated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_date, ticker)
);

-- Leaderboard reads: "everything on day X, sorted by day return."
CREATE INDEX IF NOT EXISTS idx_movers_date_return ON movers(snapshot_date, day_return_pct);
