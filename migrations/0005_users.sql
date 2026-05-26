-- User identity + subscription tier.
-- One row per Clerk user. Created on first sign-in (lazy-init via Clerk
-- webhook later, or on-demand when a user first hits a protected route).
-- Subscription columns are populated by the Stripe webhook handler
-- (app/api/stripe/webhook/route.ts) and mirror what Stripe sends.
--
-- Source of truth for tier is THIS table, not Stripe — webhook events
-- are eventually consistent but the local row reflects the last
-- successfully processed event. Clerk's publicMetadata.tier is a
-- denormalized mirror written by the same webhook so client-side code
-- can render the right UI without round-tripping to D1.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                            -- Clerk user_id (user_xxx)
  email TEXT NOT NULL UNIQUE,                     -- For lookup by email
  tier TEXT NOT NULL DEFAULT 'free',              -- 'free' | 'pro'
  stripe_customer_id TEXT UNIQUE,                 -- cus_xxx, NULL until first checkout
  stripe_subscription_id TEXT UNIQUE,             -- sub_xxx, NULL when no active sub
  subscription_status TEXT,                       -- active | past_due | canceled | unpaid | incomplete
  current_period_end INTEGER,                     -- Unix seconds — when the current paid period ends
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email             ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer   ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_tier              ON users(tier);
