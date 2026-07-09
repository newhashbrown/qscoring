/**
 * Policy exposure — LOCAL sample harness for quality review (Phase 3).
 *
 * A no-deploy, no-D1 way to eyeball classification quality before committing to a
 * full-universe run. It exercises the REAL classification path — FMP profile →
 * buildPolicyPayload → the exact system prompt + forced tool → zod parse →
 * degeneracy check — for a handful of tickers and PRINTS the result. It does NOT
 * persist anything and does NOT touch the deployed Worker; the production path
 * (batch API + D1 persist via scripts/generate-policy-tags.ts) runs only after
 * quality is approved.
 *
 * Uses a direct (non-batch) messages.create per ticker so output is immediate —
 * fine for a 5-ticker sample; the full run uses the cheaper Batches API.
 *
 * Run (keys in your own env — never pass them on the command line):
 *   ANTHROPIC_API_KEY=… FMP_API_KEY=… npm run policy-sample
 *   ANTHROPIC_API_KEY=… FMP_API_KEY=… npm run policy-sample -- TSLA JPM CVX
 */
import Anthropic from "@anthropic-ai/sdk";
import { fmp } from "../lib/scoring/fmp";
import { buildPolicyPayload } from "../lib/policy/grounding";
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
} from "../lib/policy/types";

const MODEL = process.env.POLICY_MODEL ?? "claude-haiku-4-5-20251001";
const DEFAULT_SAMPLE = ["AAPL", "PFE", "XOM", "GOOGL", "WMT"]; // tech/pharma/energy/antitrust/retail

async function classify(client: Anthropic, ticker: string): Promise<void> {
  const profile = (await fmp.profile(ticker).catch(() => []))[0];
  if (!profile) {
    console.log(`\n=== ${ticker} — no FMP profile ===`);
    return;
  }
  const { payload } = buildPolicyPayload({
    ticker,
    companyName: profile.companyName ?? null,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    description: profile.description ?? null,
  });

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

  const header = `${ticker} — ${profile.companyName} (${profile.sector ?? "?"} / ${profile.industry ?? "?"})`;
  console.log(`\n=== ${header} ===`);

  const block = msg.content.find((b) => b.type === "tool_use");
  const parsed = block && block.type === "tool_use" ? parsePolicyExposures(block.input) : null;
  if (!parsed) {
    console.log("  UNPARSEABLE tool output");
    return;
  }
  for (const t of POLICY_TAGS) {
    const e = parsed[t.key];
    console.log(`  ${t.label.padEnd(22)} ${e.level.toUpperCase().padEnd(7)} ${e.rationale}`);
  }
  const deg = degenerateReason(parsed);
  if (deg) console.log(`  ⚠ DEGENERATE (would be rejected): ${deg}`);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!process.env.FMP_API_KEY) throw new Error("FMP_API_KEY is not set");
  const tickers = process.argv.slice(2).map((s) => s.toUpperCase()).filter(Boolean);
  const list = tickers.length ? tickers : DEFAULT_SAMPLE;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log(`Policy sample: ${list.join(", ")} (model ${MODEL}) — print-only, no D1, no deploy`);
  for (const ticker of list) {
    try {
      await classify(client, ticker);
    } catch (err) {
      console.error(`  [${ticker}] error:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
