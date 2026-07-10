/**
 * Export policy-exposure LEVELS from D1 → data/policy-levels.json (Phase 3
 * screener facet). A compact, committed levels-only projection (no rationales)
 * that data/categories.ts imports so the /scores/[slug] policy category pages
 * can filter picks WITHOUT baking policy into the daily-rebuilt scoreboard.json.
 * Mirrors the data/factor-exposures/ side-artifact pattern.
 *
 * Reads D1 directly via wrangler (same as every other D1 read this session), so
 * it needs no deployed route. Ticker keys are upper-cased for a stable join with
 * scoreboard.json (both already use hyphen class-share format, e.g. BRK-B).
 *
 * Run (wrangler must be authenticated):
 *   npm run policy-levels
 * Regenerate after a policy batch; commit the resulting data/policy-levels.json.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { POLICY_TAG_KEYS, POLICY_PROMPT_VERSION, POLICY_LEVELS, type PolicyLevel } from "../lib/policy/types";

type LevelsMap = Record<string, Record<string, PolicyLevel>>;

function readD1Rows(): Array<{ ticker: string; exposures_json: string }> {
  const cmd =
    `npx wrangler d1 execute qscoring-db --remote --json ` +
    `--command "SELECT ticker, exposures_json FROM policy_exposures WHERE prompt_version='${POLICY_PROMPT_VERSION}'"`;
  const out = execSync(cmd, { encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 });
  // wrangler prints the results as a JSON array; skip any banner prefix.
  const start = out.indexOf("[");
  if (start < 0) throw new Error("wrangler returned no JSON array — is it authenticated?");
  const parsed = JSON.parse(out.slice(start)) as Array<{ results?: unknown[] }>;
  return (parsed[0]?.results ?? []) as Array<{ ticker: string; exposures_json: string }>;
}

function main() {
  const rows = readD1Rows();
  const levels: LevelsMap = {};
  let skipped = 0;
  for (const r of rows) {
    let ex: Record<string, { level?: string }>;
    try {
      ex = JSON.parse(r.exposures_json);
    } catch {
      skipped++;
      continue;
    }
    const perTag: Record<string, PolicyLevel> = {};
    let ok = true;
    for (const k of POLICY_TAG_KEYS) {
      const lv = ex[k]?.level;
      if (!lv || !(POLICY_LEVELS as readonly string[]).includes(lv)) { ok = false; break; }
      perTag[k] = lv as PolicyLevel;
    }
    if (!ok) { skipped++; continue; }
    levels[r.ticker.toUpperCase()] = perTag;
  }

  const outPath = path.resolve(process.cwd(), "data", "policy-levels.json");
  const payload = { promptVersion: POLICY_PROMPT_VERSION, count: Object.keys(levels).length, levels };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${payload.count} tickers → ${outPath} (skipped ${skipped} malformed)`);
}

main();
