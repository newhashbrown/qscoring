/**
 * Builds data/exit-prices.json — the survivorship-correction store the forward-
 * return engine consumes (lib/performance loadExitPrices, issue #60 Phase A).
 *
 * For each committed snapshot date E, finds names that were in a recent
 * snapshot (within the longest horizon, 252 trading days) but are ABSENT from
 * E's snapshot — i.e. they left the universe by E — and records each one's
 * SETTLED end-of-day close ON date E. cohortStats then includes those names at
 * their real return instead of survivorship-dropping them.
 *
 * Correctness (from review):
 *   - Price is pinned to the EXACT date E (the bar dated E), never "latest" —
 *     using any price after E would be look-ahead.
 *   - Lookback is the longest horizon (252 trading days), not just the prior
 *     snapshot, so 1-year cohorts' exited names are captured too.
 *   - Same settled-close basis as the snapshot ledger (FMP historical EOD,
 *     /stable/historical-price-eod/light), consistent with lib/snapshot-price.
 *   - A name with no bar on E (true delisting before E, or a data gap) is
 *     SKIPPED — never fabricated. Those are Phase B (terminal values).
 *
 * Idempotent: merges into any existing store and rewrites it sorted, so the
 * daily cron just keeps it current. Committed JSON (part of the auditable
 * no-look-ahead ledger) so /performance stays static.
 *
 * Run:  FMP_API_KEY=… npx tsx scripts/build-exit-prices.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { tradingDaysBetween } from "../lib/performance";
import { looksLikeFundOrEtf } from "../lib/scoring/universe";
import { toLedgerBasisFactor, loadSplits } from "../lib/splits";

const SNAP_DIR = path.resolve(process.cwd(), "data", "snapshots");
const OUT_FILE = path.resolve(process.cwd(), "data", "exit-prices.json");
const FMP_BASE = "https://financialmodelingprep.com/stable";
const LOOKBACK_TRADING_DAYS = 252; // longest horizon (1-year)
const REQUEST_GAP_MS = 250;
const REQUEST_TIMEOUT_MS = 8_000;

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY is not set — required to fetch exit prices.");
  return key;
}

function snapshotDates(): string[] {
  if (!fs.existsSync(SNAP_DIR)) return [];
  return fs
    .readdirSync(SNAP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

// company names captured across all snapshots, for the fund/ETF filter below.
const nameByTicker = new Map<string, string>();

function tickersIn(date: string): Set<string> {
  const raw = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, `${date}.json`), "utf-8"));
  const set = new Set<string>();
  for (const p of (raw.picks ?? []) as Array<{ ticker: string; companyName?: string }>) {
    set.add(p.ticker);
    if (p.companyName && !nameByTicker.has(p.ticker)) nameByTicker.set(p.ticker, p.companyName);
  }
  return set;
}

async function eodClosesByDate(symbol: string): Promise<Map<string, number>> {
  const url = `${FMP_BASE}/historical-price-eod/light?symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
  if (!res || !res.ok) return new Map();
  type EodRow = { date?: string; price?: number; close?: number };
  const json = (await res.json().catch(() => null)) as
    | EodRow[]
    | { historical?: EodRow[] }
    | null;
  const rows: EodRow[] = Array.isArray(json) ? json : (json?.historical ?? []);
  const out = new Map<string, number>();
  for (const r of rows) {
    const close = typeof r.price === "number" ? r.price : r.close;
    if (typeof r.date === "string" && typeof close === "number" && Number.isFinite(close)) {
      out.set(r.date, close);
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dates = snapshotDates();
  if (dates.length === 0) {
    console.log("No snapshots — nothing to do.");
    return;
  }
  const inByDate = new Map<string, Set<string>>(dates.map((d) => [d, tickersIn(d)]));

  // Only build exit prices to support cohorts that will actually be REPORTED:
  // clean, full-universe snapshots. The IC engine's MIN_COHORT_N gate already
  // excludes cohorts touching the tiny ~66-name curated era (through ~05-22) or
  // the fund-contaminated era (~400 funds, through 06-11), so those snapshots
  // need no exit prices — and seeding the store from them would pull in funds,
  // ETFs (BND/BNDX), and curated-era artifacts. A clean full-universe snapshot
  // has ~800 names and ~0 fund-like tickers; the bad eras are far outside both.
  const MIN_CLEAN_SIZE = 700;
  const MAX_FUNDLIKE = 10;
  const fundLikeCount = (date: string): number => {
    let n = 0;
    for (const t of inByDate.get(date)!) {
      if (looksLikeFundOrEtf({ symbol: t, companyName: nameByTicker.get(t) })) n += 1;
    }
    return n;
  };
  const cleanDates = dates.filter(
    (d) => inByDate.get(d)!.size >= MIN_CLEAN_SIZE && fundLikeCount(d) < MAX_FUNDLIKE
  );
  console.log(
    `${cleanDates.length}/${dates.length} snapshots are clean full-universe — building exit prices over those only.`
  );

  // ticker → set of clean end-dates that need that ticker's close (it was in a
  // recent clean snapshot but left the universe by that clean end-date).
  const needed = new Map<string, Set<string>>();
  for (const end of cleanDates) {
    const inEnd = inByDate.get(end)!;
    for (const start of cleanDates) {
      if (start >= end) continue;
      const td = tradingDaysBetween(start, end);
      if (td <= 0 || td > LOOKBACK_TRADING_DAYS) continue;
      for (const ticker of inByDate.get(start)!) {
        if (inEnd.has(ticker)) continue;
        // Belt-and-suspenders: never give a fund/ETF an exit price.
        if (looksLikeFundOrEtf({ symbol: ticker, companyName: nameByTicker.get(ticker) })) continue;
        if (!needed.has(ticker)) needed.set(ticker, new Set());
        needed.get(ticker)!.add(end);
      }
    }
  }

  // Merge into any existing store (incremental / idempotent).
  const store: Record<string, Record<string, number>> = {};
  if (fs.existsSync(OUT_FILE)) {
    try {
      Object.assign(store, JSON.parse(fs.readFileSync(OUT_FILE, "utf-8")));
    } catch {
      /* corrupt → rebuild from scratch */
    }
  }

  // FMP returns split-ADJUSTED history: a bar for end-date E fetched after a
  // later split is on the newest basis, not the basis E traded on — which
  // would silently re-base already-correct store rows on every daily rebuild.
  // Multiply back by the ratio of every split after E (issue #76).
  const splits = loadSplits();

  const tickers = [...needed.keys()].sort();
  let filled = 0;
  let missing = 0;
  console.log(`Resolving exit prices for ${tickers.length} exited tickers across ${dates.length} snapshots…`);
  for (const ticker of tickers) {
    const closes = await eodClosesByDate(ticker);
    const events = splits[ticker] ?? [];
    for (const end of needed.get(ticker)!) {
      const close = closes.get(end);
      if (close !== undefined) {
        (store[end] ??= {})[ticker] = close * toLedgerBasisFactor(events, end);
        filled += 1;
      } else {
        missing += 1; // no bar on `end` — delisted before then, or a data gap (Phase B)
      }
    }
    await sleep(REQUEST_GAP_MS);
  }

  // Stable, sorted output for clean diffs.
  const sorted: Record<string, Record<string, number>> = {};
  for (const end of Object.keys(store).sort()) {
    sorted[end] = {};
    for (const ticker of Object.keys(store[end]).sort()) sorted[end][ticker] = store[end][ticker];
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(
    `Wrote ${OUT_FILE}: ${Object.keys(sorted).length} end-dates, ${filled} (end-date, ticker) closes filled, ` +
      `${missing} missing (no bar on the end date — delisting/gap, Phase B).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
