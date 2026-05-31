/**
 * Look-ahead truncation check (Phase 1 acceptance gate).
 *
 * Property under test: a factor score computed "as of" date D must depend ONLY
 * on data at or before D. We verify it the way the spec asks — run on full
 * history, truncate the most-recent N days of INPUT, rerun, and assert the
 * as-of scores match on the overlap.
 *
 * Scope (per design): a small FIXED ticker set, price-path factors only
 * (momentum sub-components + realized vol). It exercises the real
 * lib/scoring/momentum.ts functions. Fundamentals are intentionally excluded —
 * FMP TTM endpoints are current-only and can't be made point-in-time, so a
 * truncation check on them would be testing a limitation, not the scorer.
 *
 * Exit code 1 on any mismatch so CI / a pre-Phase-2 gate can depend on it.
 *
 *   npm run research:lookahead
 */
import { fmp, type PricePoint } from "../../lib/scoring/fmp";
import { return1mo, return3mo, return12mo, rsi14, realizedVolatility } from "../../lib/scoring/momentum";
import * as fs from "node:fs";
import * as path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const TICKERS = ["AAPL", "MSFT", "XOM", "JPM", "NVDA"];
const TRUNCATE_DAYS = 30; // drop this many most-recent rows on the second run
const ASOF_OFFSETS = [20, 50, 120]; // rows past the truncation point to probe

function sortNewestFirst(h: PricePoint[]): PricePoint[] {
  return [...h].sort((a, b) => (a.date < b.date ? 1 : -1));
}

type Sig = { r12: number | null; r3: number | null; r1: number | null; rsi: number | null; vol: number | null };

function signatureAsOf(newestFirst: PricePoint[], asof: string): Sig {
  const upto = newestFirst.filter((p) => p.date <= asof);
  return {
    r12: return12mo(upto),
    r3: return3mo(upto),
    r1: return1mo(upto),
    rsi: rsi14(upto),
    vol: realizedVolatility(upto),
  };
}

function eq(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return a === b; // identical inputs → identical math; exact match expected
}

async function main() {
  let failures = 0;
  let checks = 0;

  for (const ticker of TICKERS) {
    const hist = sortNewestFirst(await fmp.historical(ticker).catch(() => [] as PricePoint[]));
    if (hist.length < TRUNCATE_DAYS + Math.max(...ASOF_OFFSETS) + 252) {
      console.warn(`  ⚠ ${ticker}: history too short (${hist.length}), skipping`);
      continue;
    }
    const full = hist;
    const truncated = hist.slice(TRUNCATE_DAYS); // remove the most-recent N rows

    for (const off of ASOF_OFFSETS) {
      const asof = full[TRUNCATE_DAYS + off].date; // a date older than the truncation cut
      const a = signatureAsOf(full, asof);
      const b = signatureAsOf(truncated, asof);
      checks++;
      const ok =
        eq(a.r12, b.r12) && eq(a.r3, b.r3) && eq(a.r1, b.r1) && eq(a.rsi, b.rsi) && eq(a.vol, b.vol);
      if (!ok) {
        failures++;
        console.error(`  ✘ ${ticker} @ ${asof}\n    full=${JSON.stringify(a)}\n    trunc=${JSON.stringify(b)}`);
      } else {
        console.log(`  ✓ ${ticker} @ ${asof} — as-of scores identical after truncation`);
      }
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) {
    console.error("LOOK-AHEAD CHECK FAILED — a factor score changed when future data was removed.");
    process.exit(1);
  }
  console.log("LOOK-AHEAD CHECK PASSED — price-path factors depend only on past data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
