/**
 * Thin wrapper around Resend's REST API. We hit the HTTP endpoint directly
 * instead of pulling in the SDK so the Cloudflare Worker bundle stays small.
 *
 * Failures here never throw out — email is best-effort. The caller (e.g.
 * /api/subscribe) should fire-and-forget so a Resend hiccup never blocks
 * the user-facing waitlist confirmation.
 */

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

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = process.env.EMAIL_FROM ?? "QScoring <onboarding@resend.dev>";

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
