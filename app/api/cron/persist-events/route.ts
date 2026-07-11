import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { timingSafeEqual } from "@/lib/request-guards";
import { isValidEventRow } from "@/lib/events/types";

// POST /api/cron/persist-events
//
// FULL-REPLACE upsert of the upcoming-events table (migrations/0012). Called by
// scripts/build-events.ts after fetching the FMP calendars. The table holds only
// upcoming events, so a daily run DELETEs the whole table and re-inserts the
// fresh future window in ONE transaction — this is deliberate (not a date-keyed
// upsert): FMP reschedules earnings dates, and replace-all makes rescheduled and
// canceled events disappear instead of lingering as phantom rows.
//
// SAFETY: a replace with zero valid rows is refused (returns without deleting) so
// a transient FMP outage / plan-gated calendar can't wipe the whole calendar.
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN.
// Payload: { "rows": [ { ticker, eventType, eventDate, details } ] }

const MAX_ROWS = 20000;

type IncomingRow = {
  ticker?: unknown;
  eventType?: unknown;
  eventDate?: unknown;
  details?: unknown;
};

export async function POST(req: Request) {
  let cf;
  try {
    cf = getCloudflareContext();
  } catch {
    return NextResponse.json({ ok: false, error: "Cloudflare context not available" }, { status: 503 });
  }

  const env = cf?.env as { SNAPSHOT_CRON_TOKEN?: string; DB?: D1Database } | undefined;
  const expectedToken = (env?.SNAPSHOT_CRON_TOKEN ?? "").trim();
  const auth = req.headers.get("authorization") ?? "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expectedToken || !(await timingSafeEqual(got, expectedToken))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = env?.DB;
  if (!db) return NextResponse.json({ ok: false, error: "Database binding missing" }, { status: 503 });

  let body: { rows?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `rows must be an array of at most ${MAX_ROWS}` },
      { status: 400 }
    );
  }

  const insertStmt = db.prepare(
    `INSERT INTO ticker_events (ticker, event_type, event_date, details_json)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(ticker, event_type, event_date) DO UPDATE SET
       details_json = excluded.details_json, ingested_at = CURRENT_TIMESTAMP`
  );

  const inserts = [];
  let skipped = 0;
  for (const raw of body.rows as IncomingRow[]) {
    if (!isValidEventRow(raw)) {
      skipped++;
      continue;
    }
    const ticker = String(raw.ticker).toUpperCase();
    const details = raw.details === undefined ? null : JSON.stringify(raw.details);
    inserts.push(insertStmt.bind(ticker, raw.eventType, raw.eventDate, details));
  }

  // Refuse to wipe the calendar on an empty/all-invalid batch (transient FMP
  // failure or a plan-gated calendar) — a replace only proceeds with real data.
  if (inserts.length === 0) {
    return NextResponse.json({ ok: true, written: 0, skipped, replaced: false });
  }

  try {
    // Atomic full replace: clear the table, then insert the fresh window.
    await db.batch([db.prepare("DELETE FROM ticker_events"), ...inserts]);
  } catch (err) {
    console.error("ticker_events replace failed:", err);
    return NextResponse.json({ ok: false, error: "Database write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, written: inserts.length, skipped, replaced: true });
}
