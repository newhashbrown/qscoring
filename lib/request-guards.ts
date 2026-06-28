/**
 * Small request-hardening helpers shared across API routes.
 *
 * - bodyExceeds: a cheap pre-parse size guard. Content-Length is client-supplied
 *   (it can be omitted or spoofed) and Cloudflare already enforces a platform
 *   body limit, so this is COST defense-in-depth — it rejects obviously-oversized
 *   posts before we buffer/parse them, not a hard guarantee.
 * - timingSafeEqual: constant-time secret comparison. The Workers runtime has no
 *   Node `crypto.timingSafeEqual`, so we hash both inputs with SHA-256 (fixed
 *   length, no early-exit) and compare the digests byte-by-byte. Hashing first
 *   also avoids leaking the secret's length.
 */

// Public JSON form posts (subscribe, watch, portfolio/analyze) carry a few KB at
// most. Stripe webhook events vary and can be larger, so they get their own cap.
export const MAX_FORM_BODY_BYTES = 64 * 1024; // 64 KB
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024; // 1 MB

/** True when the request's declared Content-Length exceeds maxBytes. */
export function bodyExceeds(req: Request, maxBytes: number): boolean {
  const header = req.headers.get("content-length");
  if (!header) return false; // absent → can't pre-check; platform limit still applies
  const len = Number(header);
  return Number.isFinite(len) && len > maxBytes;
}

/** Constant-time comparison of two secrets (SHA-256 digests, XOR-accumulated). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}
