import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// POST /api/cron/persist-factor-exposures
//
// Loads a Fama-French factor-exposure snapshot into D1
// (migrations/0009_factor_exposures.sql). Called by the monthly
// scripts/factor_exposures/run.py job, which computes the regressions and posts
// the rows here. Idempotent: a same-month re-run overwrites the row with the
// fresh computation (ON CONFLICT DO UPDATE on the whole row).
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN (reuses the snapshot cron secret).
//
// NOTE: snapshot_date is a FF month-end and is validated for FORMAT only. Unlike
// persist-snapshot, it is NOT checked against the US trading calendar — month-ends
// are frequently weekends/holidays, which would spuriously reject valid runs.
//
// Payload:
//   {
//     "snapshotDate": "2026-04-30",
//     "modelVersion": "ff6-v1",
//     "rows": [ { ticker, betaMktRf, ..., tstatMktRf, ..., alphaAnnualized,
//                 alphaTstat, r2, adjR2, nObs, windowStart, windowEnd,
//                 styleLabel, flags } ]
//   }

type IncomingPayload = {
  snapshotDate?: unknown;
  modelVersion?: unknown;
  rows?: unknown[];
};

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // format only — see NOTE above
const MAX_ROWS = 2000; // ~800-name universe; bounds work per invocation

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function intOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}

// Coerce flags into a stored JSON-array string of known string tokens.
function flagsJson(v: unknown): string {
  if (!Array.isArray(v)) return "[]";
  const clean = v.filter((f): f is string => typeof f === "string" && f.length < 64);
  return JSON.stringify(clean);
}

type ExposureRow = {
  ticker: string;
  betaMktRf: number | null;
  betaSmb: number | null;
  betaHml: number | null;
  betaRmw: number | null;
  betaCma: number | null;
  betaMom: number | null;
  tstatMktRf: number | null;
  tstatSmb: number | null;
  tstatHml: number | null;
  tstatRmw: number | null;
  tstatCma: number | null;
  tstatMom: number | null;
  alphaAnnualized: number | null;
  alphaTstat: number | null;
  r2: number | null;
  adjR2: number | null;
  nObs: number;
  windowStart: string | null;
  windowEnd: string | null;
  styleLabel: string | null;
  flags: string;
};

function coerceRow(raw: unknown): ExposureRow | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ticker = typeof r.ticker === "string" ? r.ticker.trim().toUpperCase() : "";
  if (!TICKER_RE.test(ticker)) return null;
  return {
    ticker,
    betaMktRf: num(r.betaMktRf),
    betaSmb: num(r.betaSmb),
    betaHml: num(r.betaHml),
    betaRmw: num(r.betaRmw),
    betaCma: num(r.betaCma),
    betaMom: num(r.betaMom),
    tstatMktRf: num(r.tstatMktRf),
    tstatSmb: num(r.tstatSmb),
    tstatHml: num(r.tstatHml),
    tstatRmw: num(r.tstatRmw),
    tstatCma: num(r.tstatCma),
    tstatMom: num(r.tstatMom),
    alphaAnnualized: num(r.alphaAnnualized),
    alphaTstat: num(r.alphaTstat),
    r2: num(r.r2),
    adjR2: num(r.adjR2),
    nObs: intOrZero(r.nObs),
    windowStart: str(r.windowStart),
    windowEnd: str(r.windowEnd),
    styleLabel: str(r.styleLabel),
    flags: flagsJson(r.flags),
  };
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

  const snapshotDate = typeof payload.snapshotDate === "string" ? payload.snapshotDate.trim() : "";
  if (!DATE_RE.test(snapshotDate)) {
    return NextResponse.json({ ok: false, error: "Invalid snapshotDate (YYYY-MM-DD)" }, { status: 400 });
  }
  const modelVersion = str(payload.modelVersion);

  if (!Array.isArray(payload.rows) || payload.rows.length === 0 || payload.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `rows must be a non-empty array of at most ${MAX_ROWS}` },
      { status: 400 }
    );
  }

  const rows: ExposureRow[] = [];
  let dropped = 0;
  for (const raw of payload.rows) {
    const row = coerceRow(raw);
    if (row) rows.push(row);
    else dropped++;
  }
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid rows" }, { status: 400 });
  }

  // Full-row upsert: a re-run replaces the row with the latest computation.
  const stmt = db.prepare(
    `INSERT INTO factor_exposures (
       ticker, snapshot_date, model_version,
       beta_mkt_rf, beta_smb, beta_hml, beta_rmw, beta_cma, beta_mom,
       tstat_mkt_rf, tstat_smb, tstat_hml, tstat_rmw, tstat_cma, tstat_mom,
       alpha_annualized, alpha_tstat, r2, adj_r2, n_obs,
       window_start, window_end, style_label, flags
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
       ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)
     ON CONFLICT(ticker, snapshot_date) DO UPDATE SET
       model_version = excluded.model_version,
       beta_mkt_rf = excluded.beta_mkt_rf,
       beta_smb = excluded.beta_smb,
       beta_hml = excluded.beta_hml,
       beta_rmw = excluded.beta_rmw,
       beta_cma = excluded.beta_cma,
       beta_mom = excluded.beta_mom,
       tstat_mkt_rf = excluded.tstat_mkt_rf,
       tstat_smb = excluded.tstat_smb,
       tstat_hml = excluded.tstat_hml,
       tstat_rmw = excluded.tstat_rmw,
       tstat_cma = excluded.tstat_cma,
       tstat_mom = excluded.tstat_mom,
       alpha_annualized = excluded.alpha_annualized,
       alpha_tstat = excluded.alpha_tstat,
       r2 = excluded.r2,
       adj_r2 = excluded.adj_r2,
       n_obs = excluded.n_obs,
       window_start = excluded.window_start,
       window_end = excluded.window_end,
       style_label = excluded.style_label,
       flags = excluded.flags,
       computed_at = CURRENT_TIMESTAMP`
  );

  const batches = rows.map((x) =>
    stmt.bind(
      x.ticker,
      snapshotDate,
      modelVersion,
      x.betaMktRf,
      x.betaSmb,
      x.betaHml,
      x.betaRmw,
      x.betaCma,
      x.betaMom,
      x.tstatMktRf,
      x.tstatSmb,
      x.tstatHml,
      x.tstatRmw,
      x.tstatCma,
      x.tstatMom,
      x.alphaAnnualized,
      x.alphaTstat,
      x.r2,
      x.adjR2,
      x.nObs,
      x.windowStart,
      x.windowEnd,
      x.styleLabel,
      x.flags
    )
  );

  try {
    await db.batch(batches);
  } catch (err) {
    console.error("factor_exposures batch upsert failed:", err);
    return NextResponse.json({ ok: false, error: "Database write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshotDate, written: rows.length, dropped });
}
