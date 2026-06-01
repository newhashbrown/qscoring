import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendEmail } from "@/lib/email/send";
import {
  watchConfirmHtml,
  watchConfirmSubject,
  watchConfirmText,
} from "@/lib/email/watchlist-confirm";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const MAX_EMAIL_LEN = 254;

function generateUnsubscribeToken(): string {
  // 128-bit token in base16; collision risk is negligible across the
  // expected lifetime of the watchlist table.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: Request) {
  let body: { email?: string; ticker?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!ticker || !TICKER_RE.test(ticker)) {
    return NextResponse.json({ ok: false, error: "Invalid ticker" }, { status: 400 });
  }

  // Rate limit before any DB write or email send: per-IP to stop floods, and
  // per-recipient to stop bombing one address with our confirmation mail.
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.EMAIL_IP_LIMITER, clientIp(req)))) return tooManyRequests();
  if (!(await allow(rl?.EMAIL_RECIPIENT_LIMITER, email))) return tooManyRequests();

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

  const unsubscribeToken = generateUnsubscribeToken();

  let inserted = false;
  let entryId: number | null = null;
  let returnedToken = unsubscribeToken;
  try {
    // INSERT OR IGNORE so re-watching the same ticker doesn't error out
    // and doesn't create a second row. If the row already existed we look
    // up its existing token so the returned unsubscribe link still works.
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO watchlist_entries (email, ticker, unsubscribe_token) VALUES (?, ?, ?)"
      )
      .bind(email, ticker, unsubscribeToken)
      .run();
    inserted = (result.meta?.changes ?? 0) > 0;

    if (!inserted) {
      const existing = await db
        .prepare(
          "SELECT id, unsubscribe_token FROM watchlist_entries WHERE email = ? AND ticker = ?"
        )
        .bind(email, ticker)
        .first<{ id: number; unsubscribe_token: string }>();
      if (existing) {
        entryId = existing.id;
        returnedToken = existing.unsubscribe_token;
      }
    } else {
      const justInserted = await db
        .prepare(
          "SELECT id FROM watchlist_entries WHERE email = ? AND ticker = ?"
        )
        .bind(email, ticker)
        .first<{ id: number }>();
      entryId = justInserted?.id ?? null;
    }
  } catch (err) {
    console.error("watch insert failed:", err);
    return NextResponse.json(
      { ok: false, error: "Could not save watch entry" },
      { status: 500 }
    );
  }

  // Confirmation + admin notify only on genuinely-new watches. Re-watches
  // return ok:true silently so the UI doesn't differentiate (also avoids
  // leaking which tickers an email is already watching).
  if (inserted && entryId !== null) {
    const unsubscribeUrl = `https://qscoring.com/api/watch/unsubscribe?id=${entryId}&token=${returnedToken}`;

    const confirmPromise = sendEmail({
      to: email,
      subject: watchConfirmSubject(ticker),
      html: watchConfirmHtml({ ticker, unsubscribeUrl }),
      text: watchConfirmText({ ticker, unsubscribeUrl }),
    })
      .then((r) => {
        if (!r.ok) console.error("watch confirm email failed:", r.error);
      })
      .catch((err) => console.error("watch confirm email exception:", err));

    const adminEmail =
      ((cf.env as { ADMIN_EMAIL?: string } | undefined)?.ADMIN_EMAIL ?? "").trim();

    const adminPromise = adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `New watchlist entry: ${email} → ${ticker}`,
          html: `<p>${email} is now watching <strong>${ticker}</strong>. Entry id ${entryId}.</p>`,
          text: `${email} is now watching ${ticker}. Entry id ${entryId}.`,
        })
          .then((r) => {
            if (!r.ok) console.error("watch admin notify failed:", r.error);
          })
          .catch((err) => console.error("watch admin notify exception:", err))
      : Promise.resolve();

    const work = Promise.all([confirmPromise, adminPromise]);
    if (cf.ctx?.waitUntil) {
      cf.ctx.waitUntil(work);
    } else {
      await work;
    }
  }

  return NextResponse.json({ ok: true });
}
