import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { QSCORE_MODEL_VERSION } from "@/lib/scoring/model-version";

// POST /api/cron/persist-snapshot
//
// Mirrors the data/snapshots/YYYY-MM-DD.json file that build-strong-picks.ts
// writes into D1 so /performance, history charts, and leaderboards can read
// by ticker without re-scanning every snapshot JSON. JSON file remains the
// source of truth (no-look-ahead audit trail in git); D1 is a denormalized
// projection.
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN. Set in two places, same value:
//   - Cloudflare:  npx wrangler secret put SNAPSHOT_CRON_TOKEN
//   - GH Actions:  repo Settings → Secrets → SNAPSHOT_CRON_TOKEN
//
// Payload shape matches the snapshot JSON minus generatedAt/universeSize:
//   {
//     "snapshotDate": "2026-05-08",     // YYYY-MM-DD, US market close (ET)
//     "modelVersion": "v0.3",            // optional; defaults to current build's QSCORE_MODEL_VERSION
//     "picks": [ /* scoreboard rows */ ]
//   }

type ApiCategory = { name: string; label: string; score: number };

type IncomingPick = {
  ticker: string;
  companyName: string;
  price: number;
  changePercent: number;
  composite: number;
  signal: string;
  confidence: string;
  longTermScore: number;
  shortTermScore: number;
  categories: ApiCategory[];
};

type IncomingPayload = {
  snapshotDate: string;
  modelVersion?: string;
  picks: IncomingPick[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const VALID_SIGNALS = new Set(["BUY_LONG_TERM", "BUY_SHORT_TERM", "HOLD", "SHORT"]);
const VALID_CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW"]);

function isValidPick(p: unknown): p is IncomingPick {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.ticker === "string" &&
    TICKER_RE.test(r.ticker) &&
    typeof r.companyName === "string" &&
    Number.isFinite(r.price) &&
    Number.isFinite(r.changePercent) &&
    Number.isFinite(r.composite) &&
    Number.isFinite(r.longTermScore) &&
    Number.isFinite(r.shortTermScore) &&
    typeof r.signal === "string" &&
    VALID_SIGNALS.has(r.signal) &&
    typeof r.confidence === "string" &&
    VALID_CONFIDENCE.has(r.confidence) &&
    Array.isArray(r.categories)
  );
}

export async function POST(req: Request) {
  let cf;
  try {
    cf = getCloudflareContext();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cloudflare context not available" },
      { status: 503 }
    );
  }

  const env = cf?.env as
    | { SNAPSHOT_CRON_TOKEN?: string; DB?: D1Database }
    | undefined;

  const expectedToken = (env?.SNAPSHOT_CRON_TOKEN ?? "").trim();
  const auth = req.headers.get("authorization") ?? "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expectedToken || got !== expectedToken) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = env?.DB;
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Database binding missing" },
      { status: 503 }
    );
  }

  let payload: IncomingPayload;
  try {
    payload = (await req.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.snapshotDate || !DATE_RE.test(payload.snapshotDate)) {
    return NextResponse.json(
      { ok: false, error: "snapshotDate must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  // Cap the array length (audit M8). The investable universe is ~800 names;
  // 2000 is generous headroom while bounding the work a (token-holding) caller
  // can force into a single Worker invocation.
  const MAX_PICKS = 2000;
  if (
    !Array.isArray(payload.picks) ||
    payload.picks.length === 0 ||
    payload.picks.length > MAX_PICKS
  ) {
    return NextResponse.json(
      { ok: false, error: `picks must be a non-empty array of at most ${MAX_PICKS}` },
      { status: 400 }
    );
  }

  const modelVersion = (payload.modelVersion ?? QSCORE_MODEL_VERSION).trim() || null;
  const snapshotDate = payload.snapshotDate;

  // Validate each row up front so a single malformed pick can't half-write
  // the day. Invalid rows fail the whole request — the caller should fix
  // and retry, not get a partial snapshot.
  const valid: IncomingPick[] = [];
  const invalid: Array<{ index: number; reason: string }> = [];
  for (let i = 0; i < payload.picks.length; i++) {
    const p = payload.picks[i];
    if (isValidPick(p)) valid.push(p);
    else invalid.push({ index: i, reason: "schema mismatch" });
  }
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Some picks failed validation", invalid },
      { status: 400 }
    );
  }

  // D1 doesn't support multi-row INSERT bindings via prepare-once-with-many-binds,
  // but it does support batch() — a single round-trip executing N prepared
  // statements atomically. Much faster than awaiting each statement.
  const stmt = db.prepare(
    `INSERT INTO score_snapshots (
       ticker, snapshot_date, composite, long_term, short_term, signal,
       confidence, price, change_percent, company_name, categories_json,
       model_version
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
     ON CONFLICT(ticker, snapshot_date) DO UPDATE SET
       composite       = excluded.composite,
       long_term       = excluded.long_term,
       short_term      = excluded.short_term,
       signal          = excluded.signal,
       confidence      = excluded.confidence,
       price           = excluded.price,
       change_percent  = excluded.change_percent,
       company_name    = excluded.company_name,
       categories_json = excluded.categories_json,
       model_version   = excluded.model_version,
       generated_at    = CURRENT_TIMESTAMP`
  );

  const batches = valid.map((p) =>
    stmt.bind(
      p.ticker,
      snapshotDate,
      p.composite,
      p.longTermScore,
      p.shortTermScore,
      p.signal,
      p.confidence,
      p.price,
      p.changePercent,
      p.companyName,
      JSON.stringify(p.categories),
      modelVersion
    )
  );

  try {
    await db.batch(batches);
  } catch (err) {
    console.error("score_snapshots batch upsert failed:", err);
    return NextResponse.json(
      { ok: false, error: "Database write failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    snapshotDate,
    modelVersion,
    upserted: valid.length,
  });
}
