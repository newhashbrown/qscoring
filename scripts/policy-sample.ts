/**
 * Policy exposure — LOCAL sample harness for quality review (Phase 3).
 *
 * A no-deploy, no-D1 way to eyeball classification quality before committing to a
 * full-universe run. It exercises the REAL classification path — FMP profile →
 * buildPolicyPayload → the exact system prompt + forced tool → zod parse →
 * degeneracy check — for a handful of tickers, PRINTS a summary, and writes the
 * full result to policy-sample-output.json (UTF-8, so no PowerShell-redirect
 * mojibake). It does NOT persist to D1 and does NOT touch the deployed Worker.
 *
 * Uses a direct (non-batch) messages.create per ticker for immediate output, with
 * one corrective retry on parse failure (mirrors the batch pipeline's robustness).
 *
 * Run (keys in your own env — never pass them on the command line):
 *   ANTHROPIC_API_KEY=… FMP_API_KEY=… npm run policy-sample
 *   ANTHROPIC_API_KEY=… FMP_API_KEY=… npm run policy-sample -- TSLA JPM CVX
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
  POLICY_TOOL_NAME,
  POLICY_TAGS,
  parsePolicyExposures,
  degenerateReason,
  type PolicyExposures,
} from "../lib/policy/types";

const MODEL = process.env.POLICY_MODEL ?? "claude-haiku-4-5-20251001";
const DEFAULT_SAMPLE = ["AAPL", "PFE", "XOM", "GOOGL", "WMT"]; // tech/pharma/energy/antitrust/retail
const OUT_FILE = path.resolve(process.cwd(), "policy-sample-output.json");

type Attempt = {
  parsed: PolicyExposures | null;
  stopReason: string | null;
  blockTypes: string[];
  rawToolInput: string | null; // truncated JSON of the tool_use input, for debugging
};

type Result = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  status: "ok" | "degenerate" | "unparseable" | "empty_profile" | "fmp_error";
  exposures?: PolicyExposures;
  degenerateReason?: string;
  detail?: string;
  diagnostics?: Attempt[]; // populated on parse failure (both attempts)
};

/** One direct (non-batch) classification call; captures parse diagnostics. */
async function callOnce(client: Anthropic, payload: PolicyPayload): Promise<Attempt> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: POLICY_MAX_TOKENS,
    temperature: POLICY_TEMPERATURE,
    system: POLICY_SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [POLICY_TOOL as any],
    tool_choice: { type: "tool", name: POLICY_TOOL_NAME },
    messages: [{ role: "user", content: buildPolicyUserMessage(payload) }],
  });

  // Select the tool_use block by TYPE (don't assume it's content[0]).
  const toolBlock = msg.content.find((b) => b.type === "tool_use");
  const rawToolInput =
    toolBlock && toolBlock.type === "tool_use" ? JSON.stringify(toolBlock.input).slice(0, 600) : null;
  const parsed = toolBlock && toolBlock.type === "tool_use" ? parsePolicyExposures(toolBlock.input) : null;

  return {
    parsed,
    stopReason: msg.stop_reason ?? null,
    blockTypes: msg.content.map((b) => b.type),
    rawToolInput,
  };
}

async function classify(client: Anthropic, ticker: string): Promise<Result> {
  let profileRows;
  try {
    profileRows = await fmp.profile(ticker);
  } catch (err) {
    return {
      ticker,
      companyName: null,
      sector: null,
      industry: null,
      status: "fmp_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const profile = profileRows[0];
  if (!profile) {
    return { ticker, companyName: null, sector: null, industry: null, status: "empty_profile" };
  }

  const { payload } = buildPolicyPayload({
    ticker,
    companyName: profile.companyName ?? null,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    description: profile.description ?? null,
  });
  const meta = { ticker, companyName: profile.companyName ?? null, sector: profile.sector ?? null, industry: profile.industry ?? null };

  // First attempt, then ONE corrective retry on parse failure (then give up).
  const first = await callOnce(client, payload);
  const attempts = [first];
  let parsed = first.parsed;
  if (!parsed) {
    const retry = await callOnce(client, payload);
    attempts.push(retry);
    parsed = retry.parsed;
  }

  if (!parsed) {
    return { ...meta, status: "unparseable", diagnostics: attempts };
  }
  const reason = degenerateReason(parsed);
  if (reason) {
    return { ...meta, status: "degenerate", exposures: parsed, degenerateReason: reason };
  }
  return { ...meta, status: "ok", exposures: parsed };
}

function printResult(r: Result): void {
  const header = `${r.ticker} — ${r.companyName ?? "?"} (${r.sector ?? "?"} / ${r.industry ?? "?"})`;
  console.log(`\n=== ${header} ===`);
  if (r.status === "fmp_error") {
    console.log(`  FMP profile ERROR: ${r.detail}`);
    return;
  }
  if (r.status === "empty_profile") {
    console.log("  FMP returned an empty profile (no row)");
    return;
  }
  if (r.status === "unparseable") {
    console.log("  UNPARSEABLE after retry — diagnostics:");
    r.diagnostics?.forEach((a, i) => {
      console.log(
        `    attempt ${i + 1}: stop_reason=${a.stopReason} blocks=[${a.blockTypes.join(",")}]` +
          (a.stopReason === "max_tokens" ? "  ← TRUNCATED (raise POLICY_MAX_TOKENS)" : "")
      );
      console.log(`      raw tool_use.input: ${a.rawToolInput ?? "(no tool_use block)"}`);
    });
    return;
  }
  if (r.exposures) {
    for (const t of POLICY_TAGS) {
      const e = r.exposures[t.key];
      console.log(`  ${t.label.padEnd(22)} ${e.level.toUpperCase().padEnd(7)} ${e.rationale}`);
    }
    if (r.status === "degenerate") console.log(`  ⚠ DEGENERATE (would be rejected): ${r.degenerateReason}`);
  }
}

async function main() {
  const ak = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const fk = (process.env.FMP_API_KEY ?? "").trim();
  if (!ak) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!fk) throw new Error("FMP_API_KEY is not set");
  const rawAk = process.env.ANTHROPIC_API_KEY ?? "";
  const rawFk = process.env.FMP_API_KEY ?? "";
  const flag = (raw: string, trimmed: string) => (raw !== trimmed ? " ⚠ surrounding whitespace" : "");
  console.log(`keys: ANTHROPIC len=${ak.length}${flag(rawAk, ak)}, FMP len=${fk.length}${flag(rawFk, fk)}`);

  const tickers = process.argv.slice(2).map((s) => s.toUpperCase()).filter(Boolean);
  const list = tickers.length ? tickers : DEFAULT_SAMPLE;
  const client = new Anthropic({ apiKey: ak });
  console.log(`Policy sample: ${list.join(", ")} (model ${MODEL}) — print-only, no D1, no deploy`);

  const results: Result[] = [];
  for (const ticker of list) {
    try {
      const r = await classify(client, ticker);
      results.push(r);
      printResult(r);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ ticker, companyName: null, sector: null, industry: null, status: "fmp_error", detail });
      console.error(`  [${ticker}] error:`, detail);
    }
  }

  // UTF-8 output file (kills PowerShell-redirect UTF-16 mojibake).
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), "utf-8");

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\nSummary: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")} — wrote ${OUT_FILE}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
