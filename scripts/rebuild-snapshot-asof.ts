/**
 * Deliberate as-of rebuild of a LOST snapshot day — the runbook's only
 * sanctioned recovery for a missed pre-market run (refresh-strong-picks.yml:
 * "accept the 1-day gap or rebuild it deliberately as-of from FMP historical
 * close"). First used for 2026-07-01, lost to a transient screener 429.
 *
 * What it does, per ticker of the last-good snapshot before the target:
 *   - price/changePercent: the target date's settled close from FMP
 *     /historical-price-eod/light, change vs the prior trading day's bar.
 *     Bars after the target date are structurally ignored (no look-ahead).
 *   - everything else (composite, signals, categories, header): carried
 *     forward from the last-good snapshot — one day STALE by design. A
 *     rescore at rebuild time would leak post-target fundamentals/prices
 *     into a target-dated cohort; stale-but-honest beats fresh-but-leaky.
 *
 * The write is append-only: refuses to touch an existing snapshot. D1 sync
 * is NOT done here — after committing the JSON, run:
 *   SNAPSHOT_CRON_TOKEN=… npx tsx scripts/backfill-snapshots.ts
 *
 * Usage:
 *   npx tsx scripts/rebuild-snapshot-asof.ts --date=2026-07-01 --scores-from=2026-06-30 [--dry-run]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { isUsTradingDate } from "../lib/market-date";
import {
  asOfLedgerPrice,
  rebuildSnapshotPicks,
  type AsOfLedger,
  type EodBar,
} from "../lib/snapshot-rebuild";

const SNAP_DIR = path.resolve(process.cwd(), "data", "snapshots");
const FMP_BASE = "https://financialmodelingprep.com/stable";
const REQUEST_GAP_MS = 300; // ~200 req/min, well under the 300/min Starter cap
const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_BACKOFF_MS = [20_000, 60_000];
// Matches build-exit-prices.ts's clean-full-universe floor and comfortably
// clears the IC's MIN_COHORT_N=600 — below this the rebuild is too thin to
// stand in the ledger, so abort rather than write a partial day.
const MIN_PICKS = 700;

// .env loader (same pattern as build-universe-stats.ts) so the script works
// locally without dotenv as a dep. Never overrides an already-set variable.
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchBars(
  symbol: string,
  from: string,
  to: string,
  apiKey: string
): Promise<EodBar[] | null> {
  const url =
    `${FMP_BASE}/historical-price-eod/light?symbol=${encodeURIComponent(symbol)}` +
    `&from=${from}&to=${to}&apikey=${apiKey}`;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
      () => null
    );
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (retryable && attempt < RETRY_BACKOFF_MS.length) {
      const wait = RETRY_BACKOFF_MS[attempt];
      console.warn(`[${symbol}] ${res ? `HTTP ${res.status}` : "network error"} — retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res || !res.ok) return null;
    type EodRow = { date?: string; price?: number; close?: number };
    const json = (await res.json().catch(() => null)) as
      | EodRow[]
      | { historical?: EodRow[] }
      | null;
    const rows: EodRow[] = Array.isArray(json) ? json : (json?.historical ?? []);
    return rows.flatMap((r) => {
      const close = typeof r.price === "number" ? r.price : r.close;
      return typeof r.date === "string" && typeof close === "number"
        ? [{ date: r.date, close }]
        : [];
    });
  }
  return null;
}

async function main() {
  loadEnv();
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY is not set (.env or environment).");

  const target = arg("date");
  const scoresFrom = arg("scores-from");
  const dryRun = process.argv.includes("--dry-run");
  if (!target || !scoresFrom) {
    throw new Error(
      "Usage: rebuild-snapshot-asof.ts --date=YYYY-MM-DD --scores-from=YYYY-MM-DD [--dry-run]"
    );
  }
  if (!isUsTradingDate(target)) {
    throw new Error(`${target} is not a US trading day — nothing to rebuild.`);
  }
  if (scoresFrom >= target) {
    throw new Error(`--scores-from (${scoresFrom}) must be BEFORE --date (${target}).`);
  }

  const outFile = path.join(SNAP_DIR, `${target}.json`);
  if (fs.existsSync(outFile)) {
    throw new Error(`${outFile} already exists — snapshots are append-only, refusing.`);
  }
  const sourceFile = path.join(SNAP_DIR, `${scoresFrom}.json`);
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Source snapshot ${sourceFile} not found.`);
  }
  // The source must be the LATEST snapshot before the target — carrying
  // scores across an older-than-necessary gap widens the staleness for no
  // reason and would misstate provenance.
  const newerSource = fs
    .readdirSync(SNAP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((d) => d > scoresFrom && d < target);
  if (newerSource.length > 0) {
    throw new Error(
      `--scores-from=${scoresFrom} is not the latest snapshot before ${target} ` +
        `(found ${newerSource.join(", ")}). Use the newest one.`
    );
  }

  const source = JSON.parse(fs.readFileSync(sourceFile, "utf-8")) as {
    generatedAt: string;
    universeSize: number;
    picks: Array<{ ticker: string; price: number; changePercent: number }>;
  };
  console.log(
    `Rebuilding ${target} as-of: ${source.picks.length} tickers, scores carried from ${scoresFrom}.`
  );

  const ledger = new Map<string, AsOfLedger>();
  let done = 0;
  for (const p of source.picks) {
    const bars = await fetchBars(p.ticker, scoresFrom, target, apiKey);
    const l = bars ? asOfLedgerPrice(bars, target) : null;
    if (l) {
      ledger.set(p.ticker, l);
      // Split/fat-finger tripwire: the frozen close should be near the source
      // day's close for a 1-day gap. Flag outliers for manual review instead
      // of silently freezing a corporate-action artifact into the ledger.
      const drift = Math.abs(l.price / p.price - 1);
      if (drift > 0.2) {
        console.warn(
          `[${p.ticker}] close moved ${(drift * 100).toFixed(1)}% vs ${scoresFrom} ` +
            `(${p.price} → ${l.price}) — check for a split/corporate action.`
        );
      }
    }
    done++;
    if (done % 100 === 0) console.log(`  …${done}/${source.picks.length}`);
    await sleep(REQUEST_GAP_MS);
  }

  const { picks, missing } = rebuildSnapshotPicks(source.picks, ledger);
  if (missing.length > 0) {
    console.warn(`Dropped ${missing.length} tickers:`);
    for (const m of missing) console.warn(`  ${m.ticker}: ${m.reason}`);
  }
  if (picks.length < MIN_PICKS) {
    throw new Error(
      `Only ${picks.length} rebuilt rows (< ${MIN_PICKS}) — too thin to stand in the ledger, aborting.`
    );
  }

  const output = {
    generatedAt: new Date().toISOString(),
    universeSize: source.universeSize,
    // Extra field, ignored by every reader (loadSnapshot/backfill/exit-prices
    // read only generatedAt/picks) — auditable provenance for a hand-rebuilt day.
    provenance: {
      method: "asof-rebuild",
      scoresCarriedFrom: scoresFrom,
      pricesFrom: "fmp /historical-price-eod/light settled closes",
      reason: "pre-market run lost; rebuilt per runbook (no-look-ahead: post-target bars excluded)",
    },
    picks,
  };

  const sample = picks.filter((p) => ["AAPL", "MSFT", "NVDA"].includes(p.ticker));
  for (const s of sample) {
    console.log(`  sample ${s.ticker}: price=${s.price} changePercent=${s.changePercent.toFixed(3)}`);
  }
  console.log(`Rebuilt ${picks.length}/${source.picks.length} rows for ${target}.`);

  if (dryRun) {
    console.log("--dry-run: not writing.");
    return;
  }
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${outFile}. Next: commit it, then re-sync D1 via backfill-snapshots.ts.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
