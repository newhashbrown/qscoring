/**
 * User tier lookup. Source of truth is the D1 `users` table; Clerk
 * `publicMetadata.tier` is a denormalized mirror written by the Stripe
 * webhook handler.
 *
 * Why both? D1 is fast (<1 ms in-Worker) and authoritative, but it
 * requires a server call. Clerk's session token carries publicMetadata
 * (when the session JWT is configured to include it), so client code
 * can render the right UI immediately without round-tripping. The
 * webhook updates both atomically.
 *
 * Reads here always go to D1. Mirrors-to-Clerk live in the webhook
 * handler (`app/api/stripe/webhook/route.ts`).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type Tier = "free" | "pro";

export type UserRow = {
  id: string;
  email: string;
  tier: Tier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Look up the current tier for a Clerk user_id. Returns 'free' for
 * unknown users — the row is created lazily on first paid checkout, so
 * a missing row means "never paid" which is functionally free.
 */
export async function getUserTier(userId: string): Promise<Tier> {
  if (!userId) return "free";

  const cf = getCloudflareContext();
  const db = cf?.env?.DB;
  if (!db) {
    // Defensive: in unusual contexts (e.g. local dev without wrangler)
    // the binding may be absent. Default to free rather than throwing
    // so the rest of the app stays usable.
    return "free";
  }

  const row = await db
    .prepare("SELECT tier FROM users WHERE id = ?")
    .bind(userId)
    .first<{ tier: Tier }>();
  return row?.tier ?? "free";
}

/**
 * Full user row by Clerk user_id, for code paths that need more than
 * just the tier (e.g. the customer portal endpoint needs the
 * stripe_customer_id). Returns null for unknown users.
 */
export async function getUserRow(userId: string): Promise<UserRow | null> {
  if (!userId) return null;
  const cf = getCloudflareContext();
  const db = cf?.env?.DB;
  if (!db) return null;
  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
}
