import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

type IncomingFact = {
  fiscalPeriodEnd: string;
  filingDate: string;
  fiscalYear: string;
  period: string;
  reportedCurrency: string | null;
  revenue: number | null;
  epsDiluted: number | null;
  freeCashFlow: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
};

type IncomingPayload = { ticker: string; facts: IncomingFact[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const VALID_PERIODS = new Set(["FY", "Q1", "Q2", "Q3", "Q4"]);

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isValidFact(f: unknown): f is IncomingFact {
  if (!f || typeof f !== "object") return false;
  const r = f as Record<string, unknown>;
  return (
    typeof r.fiscalPeriodEnd === "string" &&
    DATE_RE.test(r.fiscalPeriodEnd) &&
    typeof r.filingDate === "string" &&
    DATE_RE.test(r.filingDate) &&
    typeof r.fiscalYear === "string" &&
    typeof r.period === "string" &&
    VALID_PERIODS.has(r.period)
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

  const invalid: number[] = [];
  const valid: IncomingFact[] = [];
  payload.facts.forEach((f, i) => (isValidFact(f) ? valid.push(f) : invalid.push(i)));
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Some facts failed validation", invalid },
      { status: 400 }
    );
  }

  // INSERT … ON CONFLICT DO NOTHING — append-only. A filing already captured
  // keeps its original as-reported figures.
  const stmt = db.prepare(
    `INSERT INTO fundamentals_facts (
       ticker, fiscal_period_end, filing_date, fiscal_year, period,
       reported_currency, revenue, eps_diluted, free_cash_flow,
       gross_margin, operating_margin, net_margin
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
     ON CONFLICT(ticker, fiscal_period_end, filing_date) DO NOTHING`
  );

  const batches = valid.map((f) =>
    stmt.bind(
      ticker,
      f.fiscalPeriodEnd,
      f.filingDate,
      f.fiscalYear,
      f.period,
      f.reportedCurrency ?? null,
      numOrNull(f.revenue),
      numOrNull(f.epsDiluted),
      numOrNull(f.freeCashFlow),
      numOrNull(f.grossMargin),
      numOrNull(f.operatingMargin),
      numOrNull(f.netMargin)
    )
  );

  try {
    await db.batch(batches);
  } catch (err) {
    console.error("fundamentals_facts batch insert failed:", err);
    return NextResponse.json({ ok: false, error: "Database write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticker, submitted: valid.length });
}
