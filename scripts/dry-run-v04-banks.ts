/**
 * v0.4 bank-impact dry-run — EXACT deltas (keyed; read-only, no D1 writes).
 *
 * For every Financial-Services name in the latest snapshot, fetch FMP once and
 * score it TWICE from the same inputs: v0.4 (applicability gate ON) vs v0.3
 * (gate OFF, via scoreFromFetched opts.applyApplicability:false). Filters to
 * real banks by the live FMP industry and reports the exact composite + signal
 * deltas caused purely by the model change. Needs FMP_API_KEY (runs in CI).
 *
 * Run: FMP_API_KEY=… npm run dry-run-v04
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fetchTickerData, scoreFromFetched } from "../lib/scoring/score";
import { industryGroup } from "../lib/scoring/applicability";

// Pace FMP: each ticker fires ~7 parallel calls, so keep tickers ≥1.5s apart to
// stay under the 300/min plan ceiling (250ms burst-429'd 10 names last run).
const GAP_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function financialTickers(): string[] {
  const dir = path.resolve(process.cwd(), "data", "snapshots");
  const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().pop()!;
  const snap = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as {
    picks: Array<{ ticker: string; sector?: string }>;
  };
  return snap.picks.filter((p) => p.sector === "Financial Services").map((p) => p.ticker);
}

type Row = {
  ticker: string;
  industry: string;
  c03: number;
  c04: number;
  d: number;
  s03: string;
  s04: string;
  flip: boolean;
};

async function main() {
  if (!process.env.FMP_API_KEY) throw new Error("FMP_API_KEY is not set");
  const tickers = financialTickers();
  console.log(`Scoring ${tickers.length} Financial-Services names (v0.4 gated vs v0.3 ungated, same inputs)…`);

  const rows: Row[] = [];
  let banks = 0;
  let errors = 0;
  for (const t of tickers) {
    try {
      const data = await fetchTickerData(t);
      if (industryGroup(data.profile.sector, data.profile.industry) !== "banks") {
        await sleep(GAP_MS);
        continue;
      }
      banks++;
      const v04 = scoreFromFetched(t, data); // gate ON (v0.4)
      const v03 = scoreFromFetched(t, data, { applyApplicability: false }); // gate OFF (v0.3)
      const c03 = Math.round(v03.composite);
      const c04 = Math.round(v04.composite);
      rows.push({
        ticker: t,
        industry: data.profile.industry ?? "",
        c03,
        c04,
        d: c04 - c03,
        s03: v03.signal,
        s04: v04.signal,
        flip: v03.signal !== v04.signal,
      });
    } catch (e) {
      errors++;
      console.warn(`  [${t}] error: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(GAP_MS);
  }

  rows.sort((a, b) => b.d - a.d);
  console.log(`\nBanks scored: ${banks} | errors: ${errors}\n`);
  console.log(`ticker  industry                        v0.3→v0.4 (Δ)   signal (v0.3 → v0.4)`);
  for (const r of rows) {
    console.log(
      `  ${r.ticker.padEnd(6)} ${r.industry.slice(0, 30).padEnd(31)} ` +
        `${String(r.c03).padStart(3)}→${String(r.c04).padStart(3)} (${r.d >= 0 ? "+" : ""}${r.d})`.padEnd(18) +
        `  ${r.s03} → ${r.s04}${r.flip ? "   ⚑ FLIP" : ""}`
    );
  }
  const deltas = rows.map((r) => r.d);
  const flips = rows.filter((r) => r.flip);
  const mean = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;
  console.log(
    `\nΔcomposite: min ${Math.min(...deltas)}, max ${Math.max(...deltas)}, mean ${mean.toFixed(2)} (n=${deltas.length})`
  );
  console.log(
    `Signal flips: ${flips.length}${flips.length ? " — " + flips.map((f) => `${f.ticker} ${f.s03}→${f.s04}`).join(", ") : ""}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
