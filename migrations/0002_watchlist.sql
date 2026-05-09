-- Per-ticker watchlist entries. A user (identified only by email — no
-- account system yet) can follow any number of tickers and will get an
-- email when the QScore signal flips on any of them. last_signal /
-- last_composite are the snapshot of what we knew about the ticker the
-- last time we notified this email, so the alert worker can detect "this
-- has changed since you were last told."
--
-- Apply with:
--   npx wrangler d1 execute qscoring-db --remote --file=migrations/0002_watchlist.sql
CREATE TABLE IF NOT EXISTS watchlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ticker TEXT NOT NULL,
  last_signal TEXT,
  last_composite INTEGER,
  -- Random per-row token used in unsubscribe links so we never need a
  -- shared secret to validate one-click unsubscribes from email.
  unsubscribe_token TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_notified_at TEXT,
  notification_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(email, ticker)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_email  ON watchlist_entries(email);
CREATE INDEX IF NOT EXISTS idx_watchlist_ticker ON watchlist_entries(ticker);
