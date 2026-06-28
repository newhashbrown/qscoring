-- Fama-French factor exposures, keyed by (ticker, snapshot_date).
--
-- Append-only history of monthly factor-regression results produced by
-- scripts/factor_exposures/run.py (FF 5-factor 2x3 + Momentum, OLS with
-- Newey-West HAC errors) and loaded via /api/cron/persist-factor-exposures.
-- snapshot_date is the FF window-end month-end (YYYY-MM-DD). beta/tstat/alpha
-- columns are nullable: an insufficient-history name (n_obs < 36) is recorded
-- with NULL stats and flags=['insufficient_history'] — never a confident number.
--
-- The Worker only READS this table; all regression compute happens in the
-- GitHub Actions job.

CREATE TABLE IF NOT EXISTS factor_exposures (
  ticker            TEXT NOT NULL,
  snapshot_date     TEXT NOT NULL,            -- FF window end, month-end YYYY-MM-DD
  model_version     TEXT,
  beta_mkt_rf       REAL,
  beta_smb          REAL,
  beta_hml          REAL,
  beta_rmw          REAL,
  beta_cma          REAL,
  beta_mom          REAL,
  tstat_mkt_rf      REAL,
  tstat_smb         REAL,
  tstat_hml         REAL,
  tstat_rmw         REAL,
  tstat_cma         REAL,
  tstat_mom         REAL,
  alpha_annualized  REAL,                     -- monthly alpha x 12
  alpha_tstat       REAL,                     -- raw const t-stat (NOT annualized)
  r2                REAL,
  adj_r2            REAL,
  n_obs             INTEGER NOT NULL,
  window_start      TEXT,                     -- first observation month-end
  window_end        TEXT,                     -- last observation month-end
  style_label       TEXT,                     -- NULL when insufficient_history
  flags             TEXT NOT NULL DEFAULT '[]', -- JSON array, e.g. ["low_explanatory_power"]
  computed_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, snapshot_date)
);

-- Fast latest-row-per-ticker reads (the stock page / API hit this).
CREATE INDEX IF NOT EXISTS idx_factor_exposures_ticker_date
  ON factor_exposures(ticker, snapshot_date DESC);

-- Whole-snapshot scans by date.
CREATE INDEX IF NOT EXISTS idx_factor_exposures_date
  ON factor_exposures(snapshot_date);
