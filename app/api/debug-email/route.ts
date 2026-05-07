import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendEmail } from "@/lib/email/send";

// Temporary debug endpoint — synchronously sends a test email and returns
// the actual SendResult so we can see whether the worker can reach Resend
// and what error message it gets. Remove once we've confirmed the
// /api/subscribe path delivers.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const to = (searchParams.get("to") ?? "").trim();
  if (!to) {
    return NextResponse.json({ error: "Pass ?to=address@example.com" }, { status: 400 });
  }

  // Surface what the worker can actually see in env so we know whether the
  // problem is env access vs Resend itself.
  let envSnapshot: Record<string, string> = {};
  try {
    const ctx = getCloudflareContext();
    const env = ctx?.env as unknown as Record<string, unknown>;
    envSnapshot = {
      RESEND_API_KEY: env?.RESEND_API_KEY ? "[present]" : "[missing]",
      EMAIL_FROM: typeof env?.EMAIL_FROM === "string" ? (env.EMAIL_FROM as string) : "[missing]",
      DB: env?.DB ? "[present]" : "[missing]",
    };
  } catch (err) {
    envSnapshot = { error: err instanceof Error ? err.message : "ctx error" };
  }

  const result = await sendEmail({
    to,
    subject: "QScoring debug test",
    html: "<p>If you received this, Resend wiring is working end-to-end.</p>",
    text: "If you received this, Resend wiring is working end-to-end.",
  });

  return NextResponse.json({ env: envSnapshot, result });
}
