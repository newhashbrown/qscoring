import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// POST /api/cron/persist-movers
//
// Mirrors the data/movers/<date>.json file that the daily step writes into the
// D1 `movers` table — a queryable projection. The JSON file remains the source
// of truth (the /movers UI reads it); this table is for ad-hoc queries and the
// backtest, and is NEVER read at request time.
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN (same token as persist-snapshot — same
// daily pipeline). Payload mirrors MoversFile, flattened to rows with `side`:
//   { "snapshotDate": "2026-06-04", "rows": [ { ...mover row..., "side": "gainer" } ] }

type IncomingRow = {
  ticker: string;
  companyName: string;
  sector: string | null;
  side: "gainer" | "loser";
  dayReturnPct: number;
  close: number;
  prevClose: number | null;
  volume: number | null;
  dollarVolume: number | null;
  scoreDate: string | null;
  priorComposite: number | null;
  priorSignal: string | null;
  factors: {
    value: number | null;
    growth: number | null;
    momentum: number | null;
    profitability: number | null;
    risk: number | null;
  };
  alignment: string;
  alignmentNote: string;
};

type IncomingPayload = {
  snapshotDate: string;
  rows: IncomingRow[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const VALID_SIDES = new Set(["gainer", "loser"]);
const VALID_ALIGNMENTS = new Set([
  "confirmed_strength",
  "unsupported_pop",
  "unscored_pop",
  "confirmed_weakness",
  "dislocation",
  "unscored_drop",
]);

function isValidRow(r: unknown): r is IncomingRow {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.ticker === "string" &&
    TICKER_RE.test(o.ticker) &&
    typeof o.companyName === "string" &&
    typeof o.side === "string" &&
    VALID_SIDES.has(o.side) &&
    Number.isFinite(o.dayReturnPct) &&
    Number.isFinite(o.close) &&
    typeof o.alignment === "string" &&
    VALID_ALIGNMENTS.has(o.alignment) &&
    typeof o.alignmentNote === "string" &&
    typeof o.factors === "object" &&
    o.factors !== null
  );
}

// SQLite bindings reject undefined; coerce optional numerics/strings to null.
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
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

  const env = cf?.env as { SNAPSHOT_CRON_TOKEN?: string; DB?: D1Database } | undefined;

  const expectedToken = (env?.SNAPSHOT_CRON_TOKEN ?? "").trim();
  const auth = req.headers.get("authorization") ?? "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expectedToken || got !== expectedToken) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = env?.DB;
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database binding missing" }, { status: 503 });
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
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "rows must be a non-empty array" },
      { status: 400 }
    );
  }

  const snapshotDate = payload.snapshotDate;
  const invalid: Array<{ index: number; reason: string }> = [];
  payload.rows.forEach((r, i) => {
    if (!isValidRow(r)) invalid.push({ index: i, reason: "schema mismatch" });
  });
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Some rows failed validation", invalid },
      { status: 400 }
    );
  }

  const stmt = db.prepare(
    `INSERT INTO movers (
       snapshot_date, ticker, company_name, sector, side, day_return_pct,
       close, prev_close, volume, dollar_volume, score_date, prior_composite,
       prior_signal, factor_value, factor_growth, factor_momentum,
       factor_profitability, factor_risk, alignment, alignment_note
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)
     ON CONFLICT(snapshot_date, ticker) DO UPDATE SET
       company_name=excluded.company_name, sector=excluded.sector, side=excluded.side,
       day_return_pct=excluded.day_return_pct, close=excluded.close,
       prev_close=excluded.prev_close, volume=excluded.volume,
       dollar_volume=excluded.dollar_volume, score_date=excluded.score_date,
       prior_composite=excluded.prior_composite, prior_signal=excluded.prior_signal,
       factor_value=excluded.factor_value, factor_growth=excluded.factor_growth,
       factor_momentum=excluded.factor_momentum,
       factor_profitability=excluded.factor_profitability, factor_risk=excluded.factor_risk,
       alignment=excluded.alignment, alignment_note=excluded.alignment_note,
       generated_at=CURRENT_TIMESTAMP`
  );

  const batches = payload.rows.map((r) =>
    stmt.bind(
      snapshotDate,
      r.ticker,
      r.companyName,
      strOrNull(r.sector),
      r.side,
      r.dayReturnPct,
      r.close,
      numOrNull(r.prevClose),
      numOrNull(r.volume),
      numOrNull(r.dollarVolume),
      strOrNull(r.scoreDate),
      numOrNull(r.priorComposite),
      strOrNull(r.priorSignal),
      numOrNull(r.factors?.value),
      numOrNull(r.factors?.growth),
      numOrNull(r.factors?.momentum),
      numOrNull(r.factors?.profitability),
      numOrNull(r.factors?.risk),
      r.alignment,
      r.alignmentNote
    )
  );

  try {
    await db.batch(batches);
  } catch (err) {
    console.error("movers batch upsert failed:", err);
    return NextResponse.json({ ok: false, error: "Database write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshotDate, upserted: payload.rows.length });
}
