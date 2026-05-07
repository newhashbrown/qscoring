import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

  try {
    // INSERT OR IGNORE returns success even if email already exists, so we
    // don't leak which emails are signed up.
    await db
      .prepare(
        "INSERT OR IGNORE INTO subscribers (email, source, ip_hash, user_agent, country) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(email, source, ipHash, userAgent || null, country)
      .run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("subscribe insert failed:", err);
    return NextResponse.json(
      { ok: false, error: "Could not save email" },
      { status: 500 }
    );
  }
}
