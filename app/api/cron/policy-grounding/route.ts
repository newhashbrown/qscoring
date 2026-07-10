import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { timingSafeEqual } from "@/lib/request-guards";
import { fmp } from "@/lib/scoring/fmp";
import { buildPolicyPayload } from "@/lib/policy/grounding";
import { POLICY_PROMPT_VERSION } from "@/lib/policy/types";

// POST /api/cron/policy-grounding
//
// Assembles the policy-classification grounding payload for a batch of tickers
// and returns it to scripts/generate-policy-tags.ts (which has no FMP/D1 binding
// of its own). Unlike narrative-grounding this reads from FMP, not D1: policy
// exposure is determined by the company's sector/industry/business description,
// which lives in the FMP profile (not stored in D1). Also returns each ticker's
// stored input_hash for the current prompt_version so the generator can skip
// unchanged tickers without a second round-trip.
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN (reuses the snapshot cron secret).
// Payload: { "tickers": ["AAPL", ...], "promptVersion"?: "v1" }

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const MAX_TICKERS = 200;

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
      : POLICY_PROMPT_VERSION;

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

  // Profile-derived "as of": policy exposure isn't a dated snapshot, so we stamp
  // the grounding date. Worker runtime Date is fine here (unlike Workflow scripts).
  const dataAsOf = new Date().toISOString().slice(0, 10);

  const results: unknown[] = [];
  for (const ticker of tickers) {
    try {
      const profileRows = await fmp.profile(ticker).catch(() => []);
      const p = profileRows[0];
      if (!p) {
        results.push({ ticker, error: "no profile" });
        continue;
      }

      const { payload, inputHash } = buildPolicyPayload({
        ticker,
        companyName: p.companyName ?? null,
        sector: p.sector ?? null,
        industry: p.industry ?? null,
        description: p.description ?? null,
      });

      // A profile with no sector AND no description gives the model nothing to
      // ground on — skip rather than emit a fabricated classification.
      if (!payload.sector && !payload.business_description) {
        results.push({ ticker, error: "insufficient profile" });
        continue;
      }

      const stored = await db
        .prepare(
          `SELECT input_hash FROM policy_exposures
            WHERE ticker = ?1 AND prompt_version = ?2 LIMIT 1`
        )
        .bind(ticker, promptVersion)
        .first<{ input_hash: string }>();

      results.push({
        ticker,
        payload,
        inputHash,
        dataAsOf,
        stored: stored ? { inputHash: stored.input_hash } : null,
      });
    } catch (err) {
      console.error(`[api/cron/policy-grounding] ${ticker} error:`, err);
      results.push({ ticker, error: "grounding failed" });
    }
  }

  return NextResponse.json({ ok: true, promptVersion, results });
}
