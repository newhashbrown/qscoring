/**
 * Edge-runtime-safe Stripe client.
 *
 * Two specific things matter for Cloudflare Workers:
 *   1. `httpClient: Stripe.createFetchHttpClient()` — the default Node HTTP
 *      client won't work; Workers only have `fetch`.
 *   2. `cryptoProvider: Stripe.createSubtleCryptoProvider()` — used when
 *      verifying webhook signatures (constructEvent / constructEventAsync).
 *      Workers expose Web Crypto under `crypto.subtle`, not Node's `crypto`.
 *
 * The secret key is read from cf.env at call time, not at module load —
 * importing this file in a build-time context (e.g. a Server Component
 * that doesn't actually call Stripe) must not require the secret to be
 * set. Use `getStripe()` from inside route handlers.
 */
import Stripe from "stripe";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Stripe pins each major SDK version to a specific API version. Bumping
// the SDK without re-reading the changelog has caused outages — pin
// explicitly so a `npm update` doesn't silently roll us forward.
const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

let cachedStripe: Stripe | null = null;
let cachedKey: string | null = null;

export function getStripe(): Stripe {
  const cf = getCloudflareContext();
  const key = cf?.env?.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not set. Run `wrangler secret put STRIPE_SECRET_KEY` (sk_test_* for dev, sk_live_* for prod).",
    );
  }

  // Memoize the client per key so repeated calls within the same Worker
  // invocation reuse the same instance. If the key changes (e.g. via
  // wrangler secret put redeploy), the cache invalidates.
  if (cachedStripe && cachedKey === key) {
    return cachedStripe;
  }

  cachedStripe = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    typescript: true,
  });
  cachedKey = key;
  return cachedStripe;
}

/**
 * Async version of `stripe.webhooks.constructEvent()` that uses Web Crypto
 * via SubtleCrypto. Required for verifying webhooks in the Worker runtime
 * — the sync version uses Node's `crypto.timingSafeEqual` which doesn't
 * exist on Workers.
 */
export async function verifyStripeWebhook(
  payload: string,
  signatureHeader: string,
): Promise<Stripe.Event> {
  const cf = getCloudflareContext();
  const secret = cf?.env?.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET not set. Set the webhook endpoint signing secret from the Stripe dashboard via `wrangler secret put STRIPE_WEBHOOK_SECRET`.",
    );
  }
  return getStripe().webhooks.constructEventAsync(
    payload,
    signatureHeader,
    secret,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}
