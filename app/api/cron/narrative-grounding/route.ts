import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { timingSafeEqual } from "@/lib/request-guards";
import {
  buildGroundingPayload,
  type NarrativeFundamentalRow,
  type NarrativeSnapshotRow,
  type NarrativeFactorRow,
} from "@/lib/narratives/grounding";
import { NARRATIVE_PROMPT_VERSION } from "@/lib/narratives/types";

// POST /api/cron/narrative-grounding
//
// Assembles the grounding payload for a batch of tickers STRICTLY from D1
// (score_snapshots + fundamentals_facts + factor_exposures) and returns it to
// scripts/generate-narratives.ts, which has no D1 binding of its own. Also
// returns each ticker's stored input_hash for the current prompt_version so the
// generator can skip unchanged tickers without a second round-trip.
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN (reuses the snapshot cron secret).
// Payload: { "tickers": ["AAPL", ...], "promptVersion"?: "v1" }

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const MAX_TICKERS = 200;

type SnapRow = Omit<NarrativeSnapshotRow, "ticker"> & { ticker: string };
type FundRow = NarrativeFundamentalRow;
type FactorRow = NonNullable<NarrativeFactorRow>;

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

  let body: { tickers?: unknown; promptVersion?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const promptVersion =
    typeof body.promptVersion === "string" && body.promptVersion.trim()
      ? body.promptVersion.trim()
      : NARRATIVE_PROMPT_VERSION;

  if (!Array.isArray(body.tickers) || body.tickers.length === 0 || body.tickers.length > MAX_TICKERS) {
    return NextResponse.json(
      { ok: false, error: `tickers must be a non-empty array of at most ${MAX_TICKERS}` },
      { status: 400 }
    );
  }
  const tickers = [
    ...new Set(
      body.tickers
        .map((t) => (typeof t === "string" ? t.trim().toUpperCase() : ""))
        .filter((t) => TICKER_RE.test(t))
    ),
  ];

  const results: unknown[] = [];
  for (const ticker of tickers) {
    try {
      const snap = await db
        .prepare(
          `SELECT ticker, snapshot_date, company_name, composite, long_term, short_term,
                  signal, confidence, price, categories_json
             FROM score_snapshots WHERE ticker = ?1 ORDER BY snapshot_date DESC LIMIT 1`
        )
        .bind(ticker)
        .first<SnapRow>();
      if (!snap) {
        results.push({ ticker, error: "no snapshot" });
        continue;
      }

      const { results: fundRows } = await db
        .prepare(
          `SELECT fiscal_year, fiscal_period_end, period, reported_currency,
                  revenue, eps_diluted, free_cash_flow, gross_margin, operating_margin, net_margin,
                  total_equity, total_debt, cash_and_equivalents, ebitda, net_income, shares_diluted
             FROM fundamentals_facts
            WHERE ticker = ?1 AND period = 'FY'
            ORDER BY fiscal_period_end DESC LIMIT 6`
        )
        .bind(ticker)
        .all<FundRow>();

      const factor = await db
        .prepare(
          `SELECT beta_mkt_rf, beta_smb, beta_hml, beta_mom
             FROM factor_exposures WHERE ticker = ?1 ORDER BY snapshot_date DESC LIMIT 1`
        )
        .bind(ticker)
        .first<FactorRow>();

      // Recent daily history for the QScore trend summary (kept out of the hash).
      const { results: historyRows } = await db
        .prepare(
          `SELECT snapshot_date, composite, signal
             FROM score_snapshots WHERE ticker = ?1 ORDER BY snapshot_date DESC LIMIT 30`
        )
        .bind(ticker)
        .all<{ snapshot_date: string; composite: number; signal: string }>();

      const rank = await db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM score_snapshots WHERE snapshot_date = ?1 AND composite <= ?2) AS below,
             (SELECT COUNT(*) FROM score_snapshots WHERE snapshot_date = ?1) AS total`
        )
        .bind(snap.snapshot_date, snap.composite)
        .first<{ below: number; total: number }>();
      const universePercentile =
        rank && rank.total > 0 ? (rank.below / rank.total) * 100 : null;

      const stored = await db
        .prepare(
          `SELECT input_hash, data_as_of
             FROM ticker_narratives
            WHERE ticker = ?1 AND prompt_version = ?2
            ORDER BY data_as_of DESC LIMIT 1`
        )
        .bind(ticker, promptVersion)
        .first<{ input_hash: string; data_as_of: string }>();

      const { payload, inputHash, dataAsOf, scoreBand } = buildGroundingPayload({
        snapshot: snap,
        fundamentals: fundRows ?? [],
        factor: factor ?? null,
        universePercentile,
        history: historyRows ?? [],
      });

      results.push({
        ticker,
        payload,
        inputHash,
        dataAsOf,
        scoreBand,
        stored: stored ? { inputHash: stored.input_hash, dataAsOf: stored.data_as_of } : null,
      });
    } catch (err) {
      console.error(`[api/cron/narrative-grounding] ${ticker} error:`, err);
      results.push({ ticker, error: "grounding failed" });
    }
  }

  return NextResponse.json({ ok: true, promptVersion, results });
}
