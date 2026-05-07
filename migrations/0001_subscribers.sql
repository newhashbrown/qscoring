-- Subscribers / waitlist captures.
-- Source identifies which form the email came from (waitlist, early_access,
-- score-page banner, etc.) so we can attribute conversions later.
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'waitlist',
  ip_hash TEXT,
  user_agent TEXT,
  country TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at);
CREATE INDEX IF NOT EXISTS idx_subscribers_source  ON subscribers(source);
