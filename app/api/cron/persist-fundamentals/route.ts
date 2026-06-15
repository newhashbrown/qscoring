import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { partitionFacts, type FundamentalFact } from "@/lib/scoring/fundamentals";

// POST /api/cron/persist-fundamentals
//
// Appends as-reported fundamentals facts into the filing-keyed store
// (migrations/0007_fundamentals_facts.sql). Called by the weekly
// scripts/build-fundamentals.ts run, which fetches statements per ticker and
// posts them here. APPEND-ONLY: ON CONFLICT DO NOTHING preserves the figures
// first captured for a (ticker, fiscalPeriodEnd, filingDate) — the no-look-
// ahead integrity the store exists to provide.
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN (reuses the snapshot cron secret).
//
// Payload:
//   {
//     "ticker": "AAPL",
//     "facts": [ { fiscalPeriodEnd, filingDate, fiscalYear, period,
//                  reportedCurrency, revenue, epsDiluted, freeCashFlow,
//                  grossMargin, operatingMargin, netMargin } ]
//   }

type IncomingPayload = { ticker: string; facts: unknown[] };

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Coerce an untrusted JSON object into the FundamentalFact shape. partitionFacts
// then decides completeness — missing/invalid fields land in `skipped`, never
// in a write.
function coerceFact(raw: unknown): Partial<FundamentalFact> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    fiscalPeriodEnd: str(r.fiscalPeriodEnd) ?? undefined,
    filingDate: str(r.filingDate) ?? undefined,
    fiscalYear: str(r.fiscalYear) ?? undefined,
    period: str(r.period) ?? undefined,
    reportedCurrency: str(r.reportedCurrency),
    revenue: num(r.revenue),
    epsDiluted: num(r.epsDiluted),
    freeCashFlow: num(r.freeCashFlow),
    grossMargin: num(r.grossMargin),
    operatingMargin: num(r.operatingMargin),
    netMargin: num(r.netMargin),
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

  const ticker = typeof payload?.ticker === "string" ? payload.ticker.trim().toUpperCase() : "";
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ ok: false, error: "Invalid ticker" }, { status: 400 });
  }
  if (!Array.isArray(payload.facts) || payload.facts.length === 0) {
    return NextResponse.json({ ok: false, error: "facts must be a non-empty array" }, { status: 400 });
  }

  // Completeness gate: only filings with every required field present are
  // written. A null on first capture would be enshrined permanently by
  // ON CONFLICT DO NOTHING, so partials are skipped (not 400 — a valid request
  // can legitimately carry some incomplete filings) and warned individually.
  const { complete, skipped } = partitionFacts(payload.facts.map(coerceFact));

  for (const s of skipped) {
    console.warn(
      `persist-fundamentals: skipped incomplete filing ` +
        `symbol=${ticker} filingDate=${s.filingDate ?? "?"} ` +
        `missing=[${s.missing.join(",")}]`
    );
  }

  if (complete.length === 0) {
    return NextResponse.json({ ok: true, ticker, written: 0, skipped: skipped.length });
  }

  // INSERT … ON CONFLICT DO NOTHING — append-only. A filing already captured
  // keeps its original as-reported figures (a later restatement never wins).
  const stmt = db.prepare(
    `INSERT INTO fundamentals_facts (
       ticker, fiscal_period_end, filing_date, fiscal_year, period,
       reported_currency, revenue, eps_diluted, free_cash_flow,
       gross_margin, operating_margin, net_margin
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
     ON CONFLICT(ticker, fiscal_period_end, filing_date) DO NOTHING`
  );

  const batches = complete.map((f) =>
    stmt.bind(
      ticker,
      f.fiscalPeriodEnd,
      f.filingDate,
      f.fiscalYear,
      f.period,
      f.reportedCurrency ?? null,
      f.revenue,
      f.epsDiluted,
      f.freeCashFlow,
      f.grossMargin,
      f.operatingMargin,
      f.netMargin
    )
  );

  try {
    await db.batch(batches);
  } catch (err) {
    console.error("fundamentals_facts batch insert failed:", err);
    return NextResponse.json({ ok: false, error: "Database write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticker, written: complete.length, skipped: skipped.length });
}
