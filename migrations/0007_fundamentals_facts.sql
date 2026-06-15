-- Filing-keyed, append-only as-reported fundamentals store (Phase 2 / Tier 1b).
--
-- Why a separate table from score_snapshots: the daily snapshot is a LEAN
-- QScore ledger; multi-year statements (5y × ~800 tickers) would bloat it
-- 10-50× and slow /performance, which reads every snapshot in full. This
-- store is keyed by FILING, not by day, so each distinct filing is captured
-- exactly once.
--
-- Point-in-time integrity: the primary key is (ticker, fiscal_period_end,
-- filing_date). Persistence INSERTs with ON CONFLICT DO NOTHING — once a
-- filing's as-reported figures are captured they are NEVER overwritten, even
-- if FMP later serves restated numbers under the same filing date. A genuine
-- amended filing arrives with a new filing_date and is stored as a new row.
--
-- Apply with:
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0007_fundamentals_facts.sql
CREATE TABLE IF NOT EXISTS fundamentals_facts (
  ticker            TEXT NOT NULL,
  fiscal_period_end TEXT NOT NULL,   -- statement `date`: fiscal period end
  filing_date       TEXT NOT NULL,   -- when filed — the point-in-time "as of"
  fiscal_year       TEXT NOT NULL,
  period            TEXT NOT NULL,   -- FY | Q1 | Q2 | Q3 | Q4
  reported_currency TEXT,
  revenue           REAL,
  eps_diluted       REAL,
  free_cash_flow    REAL,
  gross_margin      REAL,            -- fraction (0.469 = 46.9%)
  operating_margin  REAL,
  net_margin        REAL,
  captured_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, fiscal_period_end, filing_date)
);

-- Ticker history reads: "all filings for ticker X, newest period first."
CREATE INDEX IF NOT EXISTS idx_fundamentals_ticker
  ON fundamentals_facts(ticker, fiscal_period_end DESC);
