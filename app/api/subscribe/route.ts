import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendEmail } from "@/lib/email/send";
import { WELCOME_SUBJECT, welcomeHtml, welcomeText } from "@/lib/email/welcome";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_SOURCES = new Set(["waitlist", "early_access", "score_page", "footer"]);
const MAX_EMAIL_LEN = 254;

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function POST(req: Request) {
  let body: { email?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const source = ALLOWED_SOURCES.has(body.source ?? "")
    ? (body.source as string)
    : "waitlist";

  // Cloudflare provides the real client IP via cf-connecting-ip and country
  // via cf-ipcountry. We hash the IP before storing for privacy.
  const ip = req.headers.get("cf-connecting-ip") ?? "";
  const country = req.headers.get("cf-ipcountry") ?? null;
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const ipHash = ip ? await hashIp(ip) : null;

  let db;
  try {
    db = getCloudflareContext().env.DB;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Database not available" },
      { status: 503 }
    );
  }
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Database binding missing" },
      { status: 503 }
    );
  }

  let inserted = false;
  try {
    // INSERT OR IGNORE returns success even if email already exists, so we
    // don't leak which emails are signed up. Capture meta.changes so we
    // only send the welcome email to genuinely-new subscribers.
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO subscribers (email, source, ip_hash, user_agent, country) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(email, source, ipHash, userAgent || null, country)
      .run();
    inserted = (result.meta?.changes ?? 0) > 0;
  } catch (err) {
    console.error("subscribe insert failed:", err);
    return NextResponse.json(
      { ok: false, error: "Could not save email" },
      { status: 500 }
    );
  }

  // Fire-and-forget welcome email for new subscribers. We don't block the
  // 200 response on Resend's latency, and a Resend failure should never
  // surface as a signup error to the user. sendEmail handles the missing-
  // -RESEND_API_KEY case internally (returns ok:false silently).
  if (inserted) {
    void sendEmail({
      to: email,
      subject: WELCOME_SUBJECT,
      html: welcomeHtml(),
      text: welcomeText(),
    })
      .then((r) => {
        if (!r.ok) console.error("welcome email failed:", r.error);
      })
      .catch((err) => console.error("welcome email exception:", err));
  }

  return NextResponse.json({ ok: true });
}
