/**
 * Grounded AI narratives — offline generation (AI-analysis roadmap, Phase 1).
 *
 * Pipeline (runs in GitHub Actions, no D1 binding of its own):
 *   1. Pull grounding payloads from the Worker (POST /api/cron/narrative-grounding),
 *      which assembles them strictly from D1.
 *   2. Skip any ticker whose stored input_hash + prompt_version already match
 *      (regeneration only on new fundamentals, a band change, or a prompt bump).
 *   3. Generate via the Anthropic Message Batches API (batch-only — the cost
 *      guardrail), forcing structured JSON through the emit_narrative tool.
 *   4. Validate each result: zod schema, then the numeric guardrail (every number
 *      must be grounded in the payload). A parse failure gets ONE corrective
 *      batch; a numeric-guardrail failure is a terminal reject (logged, dropped).
 *   5. Persist survivors via the Worker (POST /api/cron/persist-narratives).
 *   6. Log token usage + a cost estimate for the run.
 *
 * Run:
 *   ANTHROPIC_API_KEY=… SNAPSHOT_CRON_TOKEN=… npm run narratives -- --sample
 *   npm run narratives -- --limit 50
 *   npm run narratives -- --dry-run --sample     # print a payload, no API calls
 * Env: NARRATIVE_MAX_TICKERS caps tickers per run; NARRATIVE_MODEL overrides the model.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  NARRATIVE_PROMPT_VERSION,
  NARRATIVE_TOOL_NAME,
  NarrativeSchema,
  parseNarrative,
} from "../lib/narratives/types";
import {
  NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_TOOL,
  NARRATIVE_TEMPERATURE,
  NARRATIVE_MAX_TOKENS,
  buildUserMessage,
} from "../lib/narratives/prompt";
import { validateNarrativeNumbers } from "../lib/narratives/validate-numbers";
import type { GroundingPayload } from "../lib/narratives/grounding";
import type { Narrative } from "../lib/narratives/types";

const BASE = process.env.QSCORING_BASE ?? "https://qscoring.com";
// Verified against Anthropic docs (2026-07): fastest near-frontier model,
// supported on the Message Batches API. Batch pricing = $0.50/$2.50 per MTok.
const MODEL = process.env.NARRATIVE_MODEL ?? "claude-haiku-4-5-20251001";
const BATCH_PRICE_IN = 0.5 / 1e6;
const BATCH_PRICE_OUT = 2.5 / 1e6;

const GROUNDING_CHUNK = 200; // matches the route's MAX_TICKERS
const PERSIST_CHUNK = 500;
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 55 * 60 * 1000; // under the workflow's 60-min ceiling
const SAMPLE_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"];

type Grounding = {
  ticker: string;
  payload?: GroundingPayload;
  inputHash?: string;
  dataAsOf?: string;
  scoreBand?: string;
  stored?: { inputHash: string; dataAsOf: string } | null;
  error?: string;
};

type Args = { sample: boolean; dryRun: boolean; limit: number | null };

function parseArgs(argv: string[]): Args {
  const args: Args = { sample: false, dryRun: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sample") args.sample = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function loadUniverse(): string[] {
  const p = path.resolve(process.cwd(), "data", "compare-universe.json");
  const file = JSON.parse(fs.readFileSync(p, "utf-8")) as { entries?: Array<{ symbol?: string }> };
  const symbols = (file.entries ?? [])
    .map((e) => (typeof e.symbol === "string" ? e.symbol.trim().toUpperCase() : ""))
    .filter(Boolean);
  return [...new Set(symbols)];
}

async function fetchGrounding(tickers: string[], token: string): Promise<Grounding[]> {
  const out: Grounding[] = [];
  for (const group of chunk(tickers, GROUNDING_CHUNK)) {
    const res = await fetch(`${BASE}/api/cron/narrative-grounding`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tickers: group, promptVersion: NARRATIVE_PROMPT_VERSION }),
    });
    if (!res.ok) throw new Error(`grounding HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { results: Grounding[] };
    out.push(...body.results);
  }
  return out;
}

type BatchRequest = Anthropic.Messages.Batches.BatchCreateParams.Request;
type ReqParams = BatchRequest["params"];
type ToolParam = NonNullable<ReqParams["tools"]>[number];

/** A batch request per grounding, forcing the emit_narrative tool. */
function toRequest(g: Grounding): BatchRequest {
  const params: ReqParams = {
    model: MODEL,
    max_tokens: NARRATIVE_MAX_TOKENS,
    temperature: NARRATIVE_TEMPERATURE,
    system: NARRATIVE_SYSTEM_PROMPT,
    // The tool object's JSON-schema `required` is a readonly tuple (declared with
    // `as const` so it can't drift from the zod schema); the SDK wants a mutable
    // shape, so cast at this one boundary.
    tools: [NARRATIVE_TOOL as unknown as ToolParam],
    tool_choice: { type: "tool", name: NARRATIVE_TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(g.payload!) }],
  };
  return { custom_id: g.ticker, params };
}

type Usage = { input: number; output: number };
type BatchOutput = { byTicker: Map<string, Narrative | null>; usage: Usage };

/** Submit one batch, poll to completion, return parsed tool outputs + usage. */
async function runBatch(
  client: Anthropic,
  requests: Anthropic.Messages.Batches.BatchCreateParams.Request[]
): Promise<BatchOutput> {
  const byTicker = new Map<string, Narrative | null>();
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
      console.warn(`  [${ticker}] batch result: ${entry.result.type}`);
      continue;
    }
    const msg = entry.result.message;
    usage.input += msg.usage?.input_tokens ?? 0;
    usage.output += msg.usage?.output_tokens ?? 0;
    // Discriminated-union narrowing: inside the type guard, `block.input` is typed.
    let parsed: Narrative | null = null;
    let toolInput: unknown;
    let sawTool = false;
    for (const block of msg.content) {
      if (block.type === "tool_use") {
        sawTool = true;
        toolInput = block.input;
        parsed = parseNarrative(block.input);
        break;
      }
    }
    if (!parsed) {
      // Log WHY it failed — a bare "unparseable" is un-debuggable.
      if (!sawTool) {
        console.warn(`  [${ticker}] no tool_use block; content=[${msg.content.map((b) => b.type).join(",")}]`);
      } else {
        const issues = NarrativeSchema.safeParse(toolInput)
          .error?.issues?.slice(0, 6)
          .map((i) => `${i.path.join(".") || "(root)"}:${i.code}`)
          .join("; ");
        const keys =
          toolInput && typeof toolInput === "object"
            ? Object.keys(toolInput as Record<string, unknown>).join(",")
            : typeof toolInput;
        console.warn(`  [${ticker}] tool output failed schema — keys=[${keys}] issues=[${issues ?? "?"}]`);
      }
    }
    byTicker.set(ticker, parsed);
  }
  return { byTicker, usage };
}

async function persist(rows: unknown[], token: string): Promise<number> {
  let written = 0;
  for (const group of chunk(rows, PERSIST_CHUNK)) {
    const res = await fetch(`${BASE}/api/cron/persist-narratives`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rows: group }),
    });
    if (!res.ok) {
      console.warn(`persist HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    written += ((await res.json()) as { written?: number }).written ?? 0;
  }
  return written;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.SNAPSHOT_CRON_TOKEN;
  if (!token) throw new Error("SNAPSHOT_CRON_TOKEN is not set — required to read grounding and persist");

  // Ticker universe → apply caps.
  let tickers = args.sample ? SAMPLE_TICKERS : loadUniverse();
  const envCap = Number(process.env.NARRATIVE_MAX_TICKERS);
  const cap = Math.min(
    args.limit ?? Infinity,
    Number.isFinite(envCap) && envCap > 0 ? envCap : Infinity
  );
  if (Number.isFinite(cap)) tickers = tickers.slice(0, cap);
  console.log(`Narratives: ${tickers.length} ticker(s) via ${BASE} (prompt ${NARRATIVE_PROMPT_VERSION}, model ${MODEL})`);

  // 1. Grounding.
  const groundings = await fetchGrounding(tickers, token);
  const usable = groundings.filter((g) => !g.error && g.payload && g.inputHash);
  const missing = groundings.length - usable.length;

  // 2. Skip unchanged.
  const toGenerate = usable.filter((g) => !(g.stored && g.stored.inputHash === g.inputHash));
  const skippedUnchanged = usable.length - toGenerate.length;
  console.log(`  usable=${usable.length} missing=${missing} skipUnchanged=${skippedUnchanged} toGenerate=${toGenerate.length}`);

  if (args.dryRun) {
    const sample = toGenerate[0] ?? usable[0];
    console.log("\n--- DRY RUN: grounding payload for", sample?.ticker, "---");
    console.log(JSON.stringify(sample?.payload ?? { note: "no usable grounding" }, null, 2));
    return;
  }
  if (toGenerate.length === 0) {
    console.log("Nothing to generate. Done.");
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — required to generate narratives");
  const client = new Anthropic({ apiKey });
  const byTicker = new Map(toGenerate.map((g) => [g.ticker, g]));
  const totalUsage: Usage = { input: 0, output: 0 };

  // 3. First batch.
  const first = await runBatch(client, toGenerate.map(toRequest));
  totalUsage.input += first.usage.input;
  totalUsage.output += first.usage.output;

  // 4. One corrective batch for parse failures only (batch-only; guardrail
  //    failures are terminal and are handled below, never retried).
  const parseFailed = [...first.byTicker.entries()]
    .filter(([, n]) => n === null)
    .map(([t]) => byTicker.get(t)!)
    .filter(Boolean);
  const retry = parseFailed.length ? await runBatch(client, parseFailed.map(toRequest)) : null;
  if (retry) {
    totalUsage.input += retry.usage.input;
    totalUsage.output += retry.usage.output;
    for (const [t, n] of retry.byTicker) first.byTicker.set(t, n);
  }

  // 5. Validate + collect rows.
  const rows: unknown[] = [];
  let failedParse = 0;
  let failedNumbers = 0;
  for (const g of toGenerate) {
    const narrative = first.byTicker.get(g.ticker) ?? null;
    if (!narrative) {
      failedParse++;
      console.warn(`  [${g.ticker}] FAILED: unparseable after retry`);
      continue;
    }
    const check = validateNarrativeNumbers(narrative, g.payload!);
    if (!check.ok) {
      failedNumbers++;
      console.warn(
        `  [${g.ticker}] REJECTED (ungrounded numbers): ` +
          check.offending.map((o) => `${o.section}:${o.raw}`).join(", ")
      );
      continue;
    }
    rows.push({
      ticker: g.ticker,
      promptVersion: NARRATIVE_PROMPT_VERSION,
      model: MODEL,
      narrative,
      dataAsOf: g.dataAsOf,
      scoreBand: g.scoreBand,
      inputHash: g.inputHash,
    });
  }

  // 6. Persist + report.
  const written = await persist(rows, token);
  const cost = totalUsage.input * BATCH_PRICE_IN + totalUsage.output * BATCH_PRICE_OUT;
  console.log(
    `\nDone. written=${written} rejected(parse)=${failedParse} rejected(numbers)=${failedNumbers} ` +
      `skipUnchanged=${skippedUnchanged} missing=${missing}`
  );
  console.log(
    `Tokens: in=${totalUsage.input} out=${totalUsage.output} | run cost ≈ $${cost.toFixed(4)} ` +
      `(batch $0.50/$2.50 per MTok)`
  );

  // Don't let the job go green on a total wipeout: candidates existed but every
  // one failed validation. A partial success (some written) is fine.
  if (written === 0 && toGenerate.length > 0) {
    throw new Error(
      `Generated 0 narratives from ${toGenerate.length} candidate(s) — ` +
        `parse-failed=${failedParse}, number-rejected=${failedNumbers}. See per-ticker logs above.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
