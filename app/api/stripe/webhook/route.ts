/**
 * Stripe webhook endpoint.
 *
 * Stripe will fire events here when subscriptions are created, updated,
 * payment succeeds/fails, etc. Configure the endpoint URL in the Stripe
 * dashboard (Developers → Webhooks) pointing at:
 *
 *   https://qscoring.com/api/stripe/webhook
 *
 * The signing secret it gives you (whsec_*) goes into the Cloudflare
 * Worker secret `STRIPE_WEBHOOK_SECRET` via:
 *
 *   npx wrangler secret put STRIPE_WEBHOOK_SECRET
 *
 * This route is intentionally minimal in PR #14 — it verifies the
 * signature and logs the event type. Actual event handling
 * (customer.subscription.* → upsert D1 + Clerk publicMetadata) lands in
 * PR #15 alongside the checkout flow.
 *
 * Do NOT add `export const runtime = "edge"` here. OpenNext on Cloudflare
 * Workers does not support Next's edge runtime — declaring it makes the route
 * 500 at the platform layer (a generic plaintext "Internal Server Error"
 * BEFORE the handler runs, so even the missing-signature 400 below is never
 * reached). The default OpenNext Workers runtime already provides `fetch` and
 * `crypto.subtle`, and lib/stripe uses the fetch HTTP client + SubtleCrypto
 * provider, so signature verification works fine on it.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhook } from "@/lib/stripe";
import { bodyExceeds, MAX_WEBHOOK_BODY_BYTES } from "@/lib/request-guards";

// Stripe sends an empty 200 expectation for the success case. Any 2xx
// counts as "delivered" and stops retries; non-2xx triggers exponential
// backoff up to ~3 days. So we return 400 only for signature failures
// (don't retry — it'd just fail again), 500 for transient handler
// errors (retry), and 200 for unhandled event types (idempotent ack).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing stripe-signature header" }, { status: 400 });
  }

  if (bodyExceeds(req, MAX_WEBHOOK_BODY_BYTES)) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  // Read the raw body — Stripe's signature is computed over the raw
  // bytes, so we cannot use req.json() (which would re-serialize).
  const payload = await req.text();

  let event;
  try {
    event = await verifyStripeWebhook(payload, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "signature verification failed";
    console.error("[stripe webhook] verify failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // PR #14 stub: log and 200. PR #15 adds the real switch (event.type)
  // block that upserts D1 + Clerk publicMetadata.
  console.log("[stripe webhook] received:", event.type, event.id);

  return NextResponse.json({ received: true });
}
