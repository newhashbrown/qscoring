/**
 * Policy exposure — LOCAL full-universe batch → validated upserts SQL (Phase 3).
 *
 * A no-deploy way to get REAL classifications into remote D1 for review before
 * the routes/chips ship. It does grounding from FMP directly (no deployed
 * route), runs the Anthropic Message Batches API (batch pricing), applies the
 * SAME validation + degeneracy gate as the production persist route, and writes:
 *   - policy-batch-output.json  — every ticker's result (incl. failures), for review
 *   - policy-batch-upserts.sql  — UPSERTs for VALID rows ONLY (never partial/corrupt)
 *
 * It does NOT touch D1 itself. After it runs, apply the SQL with wrangler:
 *   npx wrangler d1 execute qscoring-db --remote --file=policy-batch-upserts.sql
 *
 * Run (keys in your own env — never on the command line):
 *   ANTHROPIC_API_KEY=… FMP_API_KEY=… npm run policy-batch-local            # full universe
 *   ANTHROPIC_API_KEY=… FMP_API_KEY=… npm run policy-batch-local -- --sample
 *   ANTHROPIC_API_KEY=… FMP_API_KEY=… npm run policy-batch-local -- --limit 50
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fmp } from "../lib/scoring/fmp";
import { buildPolicyPayload, type PolicyPayload } from "../lib/policy/grounding";
import {
  POLICY_SYSTEM_PROMPT,
  POLICY_TOOL,
  POLICY_TEMPERATURE,
  POLICY_MAX_TOKENS,
  buildPolicyUserMessage,
} from "../lib/policy/prompt";
import {
  POLICY_PROMPT_VERSION,
  POLICY_TOOL_NAME,
  parsePolicyToolOutput,
  mergeToolUseInputs,
  degenerateReason,
  type PolicyExposures,
} from "../lib/policy/types";

const MODEL = process.env.POLICY_MODEL ?? "claude-haiku-4-5-20251001";
const BATCH_PRICE_IN = 0.5 / 1e6;
const BATCH_PRICE_OUT = 2.5 / 1e6;
const GROUNDING_CONCURRENCY = 8;
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 55 * 60 * 1000;
const SAMPLE_TICKERS = ["AAPL", "PFE", "XOM", "GOOGL", "WMT"];
const OUT_JSON = path.resolve(process.cwd(), "policy-batch-output.json");
const OUT_SQL = path.resolve(process.cwd(), "policy-batch-upserts.sql");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

type Args = { sample: boolean; limit: number | null };
function parseArgs(argv: string[]): Args {
  const args: Args = { sample: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sample") args.sample = true;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

function loadUniverse(): string[] {
  const p = path.resolve(process.cwd(), "data", "compare-universe.json");
  const file = JSON.parse(fs.readFileSync(p, "utf-8")) as { entries?: Array<{ symbol?: string }> };
  const symbols = (file.entries ?? [])
    .map((e) => (typeof e.symbol === "string" ? e.symbol.trim().toUpperCase() : ""))
    .filter(Boolean);
  return [...new Set(symbols)];
}

type Grounding = { ticker: string; payload: PolicyPayload; inputHash: string };

/** FMP profile → grounding payload, with modest concurrency. Skips insufficient profiles. */
async function buildGroundings(tickers: string[]): Promise<{ groundings: Grounding[]; missing: string[] }> {
  const groundings: Grounding[] = [];
  const missing: string[] = [];
  for (const group of chunk(tickers, GROUNDING_CONCURRENCY)) {
    const settled = await Promise.all(
      group.map(async (ticker) => {
        const profile = (await fmp.profile(ticker).catch(() => []))[0];
        if (!profile) return { ticker, ok: false as const };
        const { payload, inputHash } = buildPolicyPayload({
          ticker,
          companyName: profile.companyName ?? null,
          sector: profile.sector ?? null,
          industry: profile.industry ?? null,
          description: profile.description ?? null,
        });
        if (!payload.sector && !payload.business_description) return { ticker, ok: false as const };
        return { ticker, ok: true as const, payload, inputHash };
      })
    );
    for (const s of settled) {
      if (s.ok) groundings.push({ ticker: s.ticker, payload: s.payload, inputHash: s.inputHash });
      else missing.push(s.ticker);
    }
  }
  return { groundings, missing };
}

type BatchRequest = Anthropic.Messages.Batches.BatchCreateParams.Request;
type ReqParams = BatchRequest["params"];
type ToolParam = NonNullable<ReqParams["tools"]>[number];

function toRequest(g: Grounding): BatchRequest {
  const params: ReqParams = {
    model: MODEL,
    max_tokens: POLICY_MAX_TOKENS,
    temperature: POLICY_TEMPERATURE,
    system: POLICY_SYSTEM_PROMPT,
    tools: [POLICY_TOOL as unknown as ToolParam],
    tool_choice: { type: "tool", name: POLICY_TOOL_NAME },
    messages: [{ role: "user", content: buildPolicyUserMessage(g.payload) }],
  };
  return { custom_id: g.ticker, params };
}

type Usage = { input: number; output: number };

async function runBatch(
  client: Anthropic,
  requests: BatchRequest[]
): Promise<{ byTicker: Map<string, PolicyExposures | null>; usage: Usage }> {
  const byTicker = new Map<string, PolicyExposures | null>();
  const usage: Usage = { input: 0, output: 0 };
  if (requests.length === 0) return { byTicker, usage };

  const batch = await client.messages.batches.create({ requests });
  console.log(`  batch ${batch.id}: submitted ${requests.length} request(s)`);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status = await client.messages.batches.retrieve(batch.id);
  while (status.processing_status !== "ended") {
    if (Date.now() > deadline) throw new Error(`batch ${batch.id} did not finish within the poll window`);
    await sleep(POLL_INTERVAL_MS);
    status = await client.messages.batches.retrieve(batch.id);
  }

  const stream = await client.messages.batches.results(batch.id);
  for await (const entry of stream) {
    const ticker = entry.custom_id;
    if (entry.result.type !== "succeeded") {
      byTicker.set(ticker, null);
      continue;
    }
    const msg = entry.result.message;
    usage.input += msg.usage?.input_tokens ?? 0;
    usage.output += msg.usage?.output_tokens ?? 0;
    const merged = mergeToolUseInputs(msg.content);
    const { value, error } = parsePolicyToolOutput(merged);
    if (!value) {
      const issues = error?.issues?.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}:${i.code}`).join("; ");
      console.warn(`  [${ticker}] parse failed — issues=[${issues ?? "?"}] raw=${JSON.stringify(merged).slice(0, 300)}`);
    }
    byTicker.set(ticker, value);
  }
  return { byTicker, usage };
}

const sqlStr = (s: string): string => `'${s.replace(/'/g, "''")}'`;

type Row = { ticker: string; exposures: PolicyExposures; inputHash: string };

function buildUpsertSql(rows: Row[], dataAsOf: string): string {
  const header =
    "-- Policy exposures — generated by scripts/policy-batch-local.ts (VALID rows only).\n" +
    "-- Apply: npx wrangler d1 execute qscoring-db --remote --file=policy-batch-upserts.sql\n\n";
  const stmts = rows.map((r) => {
    const cols = "(ticker, prompt_version, model, exposures_json, input_hash, data_as_of)";
    const vals = [
      sqlStr(r.ticker),
      sqlStr(POLICY_PROMPT_VERSION),
      sqlStr(MODEL),
      sqlStr(JSON.stringify(r.exposures)),
      sqlStr(r.inputHash),
      sqlStr(dataAsOf),
    ].join(", ");
    return (
      `INSERT INTO policy_exposures ${cols} VALUES (${vals})\n` +
      `ON CONFLICT(ticker, prompt_version) DO UPDATE SET ` +
      `model=excluded.model, exposures_json=excluded.exposures_json, ` +
      `input_hash=excluded.input_hash, data_as_of=excluded.data_as_of, classified_at=CURRENT_TIMESTAMP;`
    );
  });
  return header + stmts.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!(process.env.FMP_API_KEY ?? "").trim()) throw new Error("FMP_API_KEY is not set");

  let tickers = args.sample ? SAMPLE_TICKERS : loadUniverse();
  if (args.limit && Number.isFinite(args.limit)) tickers = tickers.slice(0, args.limit);
  const dataAsOf = new Date().toISOString().slice(0, 10);
  console.log(`Policy batch (local): ${tickers.length} ticker(s), model ${MODEL}, prompt ${POLICY_PROMPT_VERSION}`);

  // 1. Grounding from FMP.
  const { groundings, missing } = await buildGroundings(tickers);
  console.log(`  grounding: ${groundings.length} usable, ${missing.length} missing/insufficient`);
  if (groundings.length === 0) throw new Error("no usable groundings — check FMP_API_KEY");

  // 2. Classify via the Batches API (one corrective retry on parse failure).
  const client = new Anthropic({ apiKey });
  const byGround = new Map(groundings.map((g) => [g.ticker, g]));
  const totalUsage: Usage = { input: 0, output: 0 };
  const first = await runBatch(client, groundings.map(toRequest));
  totalUsage.input += first.usage.input;
  totalUsage.output += first.usage.output;
  const parseFailed = [...first.byTicker.entries()].filter(([, v]) => v === null).map(([t]) => byGround.get(t)!);
  if (parseFailed.length) {
    const retry = await runBatch(client, parseFailed.map(toRequest));
    totalUsage.input += retry.usage.input;
    totalUsage.output += retry.usage.output;
    for (const [t, v] of retry.byTicker) first.byTicker.set(t, v);
  }

  // 3. Validate: only parsed + non-degenerate rows are persisted (SAME gate as
  //    the production persist route). Everything else is reported, never written.
  const rows: Row[] = [];
  const failed: Array<{ ticker: string; reason: string }> = [];
  const review: unknown[] = [];
  for (const g of groundings) {
    const exposures = first.byTicker.get(g.ticker) ?? null;
    if (!exposures) {
      failed.push({ ticker: g.ticker, reason: "unparseable" });
      review.push({ ticker: g.ticker, status: "unparseable" });
      continue;
    }
    const deg = degenerateReason(exposures);
    if (deg) {
      failed.push({ ticker: g.ticker, reason: `degenerate: ${deg}` });
      review.push({ ticker: g.ticker, status: "degenerate", reason: deg, exposures });
      continue;
    }
    rows.push({ ticker: g.ticker, exposures, inputHash: g.inputHash });
    review.push({ ticker: g.ticker, status: "ok", sector: g.payload.sector, exposures });
  }

  // 4. Emit artifacts (UTF-8). SQL contains VALID rows only.
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: dataAsOf, review }, null, 2), "utf-8");
  fs.writeFileSync(OUT_SQL, buildUpsertSql(rows, dataAsOf), "utf-8");

  const cost = totalUsage.input * BATCH_PRICE_IN + totalUsage.output * BATCH_PRICE_OUT;
  const successRate = groundings.length ? ((rows.length / groundings.length) * 100).toFixed(1) : "0";
  console.log(`\nDone. valid=${rows.length}/${groundings.length} (${successRate}%) failed=${failed.length} missing=${missing.length}`);
  if (failed.length) console.log(`  failed: ${failed.map((f) => `${f.ticker}(${f.reason})`).slice(0, 40).join(", ")}`);
  console.log(`Tokens: in=${totalUsage.input} out=${totalUsage.output} | cost ≈ $${cost.toFixed(4)} (batch $0.50/$2.50 per MTok)`);
  console.log(`Wrote ${OUT_JSON} and ${OUT_SQL}`);
  console.log(`\nNext: apply to remote D1 with →\n  npx wrangler d1 execute qscoring-db --remote --file=policy-batch-upserts.sql`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
