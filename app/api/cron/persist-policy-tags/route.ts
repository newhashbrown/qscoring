import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { timingSafeEqual } from "@/lib/request-guards";
import { parsePolicyExposures, degenerateReason } from "@/lib/policy/types";

// POST /api/cron/persist-policy-tags
//
// Upserts classifications into policy_exposures (migrations/0011). Called by
// scripts/generate-policy-tags.ts after generation + validation. Idempotent on
// (ticker, prompt_version): a re-run replaces the row rather than duplicating.
// Each incoming classification is re-validated here (zod schema + the degeneracy
// guard) as defense-in-depth — a row that fails is skipped, never written.
//
// Auth: Bearer SNAPSHOT_CRON_TOKEN (reuses the snapshot cron secret).
// Payload: { "rows": [ { ticker, promptVersion, model, exposures, inputHash, dataAsOf } ] }

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 1000;

type IncomingRow = {
  ticker?: unknown;
  promptVersion?: unknown;
  model?: unknown;
  exposures?: unknown;
  inputHash?: unknown;
  dataAsOf?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

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

  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `rows must be a non-empty array of at most ${MAX_ROWS}` },
      { status: 400 }
    );
  }

  const stmt = db.prepare(
    `INSERT INTO policy_exposures
       (ticker, prompt_version, model, exposures_json, input_hash, data_as_of)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(ticker, prompt_version) DO UPDATE SET
       model = excluded.model,
       exposures_json = excluded.exposures_json,
       input_hash = excluded.input_hash,
       data_as_of = excluded.data_as_of,
       classified_at = CURRENT_TIMESTAMP`
  );

  const batches = [];
  const skipped: string[] = [];
  for (const raw of body.rows as IncomingRow[]) {
    const ticker = str(raw.ticker)?.toUpperCase() ?? "";
    const promptVersion = str(raw.promptVersion);
    const model = str(raw.model);
    const inputHash = str(raw.inputHash);
    const dataAsOf = str(raw.dataAsOf);
    const exposures = parsePolicyExposures(raw.exposures);

    if (
      !TICKER_RE.test(ticker) ||
      !promptVersion ||
      !model ||
      !inputHash ||
      !dataAsOf ||
      !DATE_RE.test(dataAsOf) ||
      !exposures ||
      degenerateReason(exposures) !== null
    ) {
      skipped.push(ticker || "?");
      continue;
    }

    batches.push(
      stmt.bind(ticker, promptVersion, model, JSON.stringify(exposures), inputHash, dataAsOf)
    );
  }

  if (skipped.length > 0) {
    console.warn(`persist-policy-tags: skipped ${skipped.length} invalid rows: ${skipped.slice(0, 20).join(",")}`);
  }
  if (batches.length === 0) {
    return NextResponse.json({ ok: true, written: 0, skipped: skipped.length });
  }

  try {
    await db.batch(batches);
  } catch (err) {
    console.error("policy_exposures batch upsert failed:", err);
    return NextResponse.json({ ok: false, error: "Database write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, written: batches.length, skipped: skipped.length });
}
