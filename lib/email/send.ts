/**
 * Thin wrapper around Resend's REST API. Hits the HTTP endpoint directly
 * instead of pulling in the SDK so the Cloudflare Worker bundle stays small.
 *
 * Failures here never throw out — email is best-effort. The caller (e.g.
 * /api/subscribe) should fire-and-forget so a Resend hiccup never blocks
 * the user-facing waitlist confirmation.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Cloudflare-set vars/secrets (added via dashboard, not wrangler.jsonc) reach
// us via the Worker env binding, not always via process.env. This helper
// prefers the env binding when available and falls back to process.env for
// local dev where getCloudflareContext throws.
type EmailEnv = { RESEND_API_KEY?: string; EMAIL_FROM?: string };

function readEnv(): EmailEnv {
  try {
    const ctx = getCloudflareContext();
    if (ctx?.env) {
      return ctx.env as unknown as EmailEnv;
    }
  } catch {
    // not running inside a Worker — fall through to process.env
  }
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const env = readEnv();
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not available" };
  const from = env.EMAIL_FROM ?? "QScoring <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
