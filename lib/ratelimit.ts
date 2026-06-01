/**
 * Thin wrapper over Cloudflare Workers Rate Limiting bindings.
 *
 * Bindings are declared in wrangler.jsonc under `ratelimits` (EMAIL_IP_LIMITER,
 * EMAIL_RECIPIENT_LIMITER, ANALYZE_IP_LIMITER, FMP_IP_LIMITER). The platform
 * fixes `period` to 10 or 60s; `limit()` returns `{ success }` and counts per
 * the string `key` we pass.
 *
 * The binding type is declared locally (rather than depending on the generated
 * cloudflare-env.d.ts) so routes can read it via the same `cf.env as {...}`
 * cast pattern used elsewhere.
 */
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitEnv = {
  EMAIL_IP_LIMITER?: RateLimiter;
  EMAIL_RECIPIENT_LIMITER?: RateLimiter;
  ANALYZE_IP_LIMITER?: RateLimiter;
  FMP_IP_LIMITER?: RateLimiter;
};

/**
 * Pull the rate-limit bindings off the Cloudflare env. Returns undefined when
 * there is no Worker context (e.g. `next dev`, where bindings don't exist).
 */
export function getRateLimitEnv(): RateLimitEnv | undefined {
  try {
    return getCloudflareContext()?.env as RateLimitEnv | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns true if the request may proceed, false if it should be throttled.
 *
 * Fails OPEN when the binding is absent (local dev has no bindings) or the
 * limiter call throws (never let a limiter hiccup take an endpoint down).
 * This is defense-in-depth: input validation and auth still run regardless,
 * and in production the binding is always present.
 */
export async function allow(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch (err) {
    console.error("[ratelimit] limiter call failed, allowing request:", err);
    return true;
  }
}

/** Standard 429 response with a Retry-After hint matching the 60s window. */
export function tooManyRequests(
  message = "Too many requests — please slow down and try again in a minute."
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}

/** Best client IP on Cloudflare; falls back to a constant when absent. */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim() || "no-ip";
}
