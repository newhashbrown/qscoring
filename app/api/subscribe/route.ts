import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendEmail } from "@/lib/email/send";
import { WELCOME_SUBJECT, welcomeHtml, welcomeText } from "@/lib/email/welcome";
import {
  adminNotifyHtml,
  adminNotifySubject,
  adminNotifyText,
} from "@/lib/email/admin-notify";

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

  let cf;
  try {
    cf = getCloudflareContext();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cloudflare context not available" },
      { status: 503 }
    );
  }

  const db = cf?.env?.DB;
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

  // Welcome email + admin notification for new subscribers. Wrapped in
  // ctx.waitUntil so the Cloudflare Worker stays alive past the response
  // while Resend processes both requests — without this, the worker
  // terminates immediately on return and the fire-and-forget sends are
  // killed mid-flight.
  if (inserted) {
    // Subscriber count is best-effort: if the COUNT query fails for any
    // reason (D1 hiccup, schema mismatch), the admin email still goes out
    // with totalCount=null. Never block the welcome path on this.
    let totalCount: number | null = null;
    try {
      const row = await db
        .prepare("SELECT COUNT(*) AS c FROM subscribers")
        .first<{ c: number }>();
      totalCount = row?.c ?? null;
    } catch (err) {
      console.error("subscriber count query failed:", err);
    }

    const welcomePromise = sendEmail({
      to: email,
      subject: WELCOME_SUBJECT,
      html: welcomeHtml(),
      text: welcomeText(),
    })
      .then((r) => {
        if (!r.ok) console.error("welcome email failed:", r.error);
      })
      .catch((err) => console.error("welcome email exception:", err));

    const adminEmail =
      ((cf.env as { ADMIN_EMAIL?: string } | undefined)?.ADMIN_EMAIL ?? "").trim();

    const adminPromise = adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: adminNotifySubject(email),
          html: adminNotifyHtml({
            email,
            source,
            country,
            ipHash,
            userAgent,
            totalCount,
          }),
          text: adminNotifyText({
            email,
            source,
            country,
            ipHash,
            userAgent,
            totalCount,
          }),
        })
          .then((r) => {
            if (!r.ok) console.error("admin notify email failed:", r.error);
          })
          .catch((err) => console.error("admin notify email exception:", err))
      : Promise.resolve();

    const emailWork = Promise.all([welcomePromise, adminPromise]);
    if (cf.ctx?.waitUntil) {
      cf.ctx.waitUntil(emailWork);
    } else {
      // Local dev fallback (no Worker ctx) — just await inline.
      await emailWork;
    }
  }

  return NextResponse.json({ ok: true });
}
