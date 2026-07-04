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
 *   - A name whose history STOPS before E (acquisition/bankruptcy) gets a
 *     terminal value in data/terminal-values.json (#60 Phase B): its last
 *     settled close, recorded only when the FMP profile ALSO confirms
 *     isActivelyTrading=false. A bar gap with later bars, or an unconfirmed
 *     stop, is left unresolved — never fabricated — and retried next run.
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
import { classifyExitPair, type TerminalStore } from "../lib/terminal-values";

const SNAP_DIR = path.resolve(process.cwd(), "data", "snapshots");
const OUT_FILE = path.resolve(process.cwd(), "data", "exit-prices.json");
const TERMINALS_FILE = path.resolve(process.cwd(), "data", "terminal-values.json");
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

// console.warn + a ::warning:: line so GitHub Actions surfaces it as a run
// annotation (same shape as build-splits.ts).
function warnLoudly(message: string): void {
  console.warn(message);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
}

/**
 * Is this symbol confirmed no-longer-trading? Guards terminal-value creation
 * (#60 Phase B): a stopped history alone could be a data gap; the profile
 * flag is the second, independent signal. Fail-closed: fetch error or
 * missing/ambiguous flag → NOT confirmed → no terminal recorded.
 */
async function isConfirmedDelisted(symbol: string): Promise<boolean> {
  const url = `${FMP_BASE}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
  if (!res || !res.ok) return false;
  const json = (await res.json().catch(() => null)) as
    | Array<{ isActivelyTrading?: boolean }>
    | null;
  return Array.isArray(json) && json[0]?.isActivelyTrading === false;
}

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

  // Terminal values for hard delistings (#60 Phase B) — merge into any
  // existing store; an already-recorded terminal is never re-fetched.
  const terminals: TerminalStore = {};
  if (fs.existsSync(TERMINALS_FILE)) {
    try {
      Object.assign(terminals, JSON.parse(fs.readFileSync(TERMINALS_FILE, "utf-8")));
    } catch {
      /* corrupt → rebuild from scratch */
    }
  }

  const tickers = [...needed.keys()].sort();
  let filled = 0;
  let terminal = 0;
  let gaps = 0;
  // Per-run cache of the delisting confirmation — both outcomes — so a ticker
  // with many needed end dates costs at most one profile fetch per run.
  const delistedCache = new Map<string, boolean>();
  console.log(`Resolving exit prices for ${tickers.length} exited tickers across ${dates.length} snapshots…`);
  for (const ticker of tickers) {
    const closes = await eodClosesByDate(ticker);
    const events = splits[ticker] ?? [];
    const lastBarDate = [...closes.keys()].sort().at(-1);

    // Audit: a terminaled ticker with bars NEWER than its recorded last bar
    // has resumed trading (the delisting flag was wrong, e.g. a long halt).
    // Real prices already win everywhere one exists; surface it for a human
    // to delete the stale row from data/terminal-values.json.
    const known = terminals[ticker];
    if (known && lastBarDate && lastBarDate > known.lastBarDate) {
      warnLoudly(
        `${ticker}: has bars through ${lastBarDate} but a terminal recorded at ` +
          `${known.lastBarDate} — it RESUMED trading; delete its stale row from ` +
          `data/terminal-values.json.`
      );
    }

    for (const end of needed.get(ticker)!) {
      const kind = classifyExitPair({
        hasBarOnEnd: closes.has(end),
        lastBarDate,
        endDate: end,
        hasRecordedTerminal: Boolean(terminals[ticker]),
      });
      switch (kind) {
        case "fill":
          (store[end] ??= {})[ticker] = closes.get(end)! * toLedgerBasisFactor(events, end);
          filled += 1;
          break;
        case "covered-by-terminal":
          break;
        case "terminal-candidate": {
          // History STOPS before this end date — a hard-delisting candidate
          // (acquisition halts at ~the deal price; bankruptcy trades to ~0).
          // Confirm with the profile flag before recording; a data gap or a
          // fetch hiccup must never fabricate a terminal.
          if (!delistedCache.has(ticker)) {
            delistedCache.set(ticker, await isConfirmedDelisted(ticker));
          }
          if (delistedCache.get(ticker)) {
            const lastClose = closes.get(lastBarDate!)!;
            terminals[ticker] = {
              lastBarDate: lastBarDate!,
              close: lastClose * toLedgerBasisFactor(events, lastBarDate!),
            };
            terminal += 1;
            console.log(
              `${ticker}: history stops ${lastBarDate}, profile confirms delisted — ` +
                `terminal value ${terminals[ticker].close} recorded.`
            );
          } else {
            gaps += 1;
            console.warn(
              `${ticker}: no bar on ${end}, history stops ${lastBarDate}, but the profile does ` +
                `NOT confirm delisting — leaving unresolved (no fabrication).`
            );
          }
          break;
        }
        case "gap":
          // Bars exist after `end` but not on it — or no bars at all. A
          // transient data hole either way; retried next run.
          gaps += 1;
          break;
      }
    }
    await sleep(REQUEST_GAP_MS);
  }

  // Invariant guard: the join-time split factor runs from entry to the cohort
  // END date, which is safe only because a delisted name can't split after
  // its last bar. A splits.json event dated after a terminal's lastBarDate
  // (ticker-symbol recycling, or a bad boundary) would silently violate that.
  for (const [t, term] of Object.entries(terminals)) {
    const late = (splits[t] ?? []).filter((e) => e.date > term.lastBarDate);
    for (const e of late) {
      warnLoudly(
        `${t}: splits.json has a ${e.numerator}:${e.denominator} boundary @ ${e.date}, AFTER ` +
          `its terminal's last bar ${term.lastBarDate} — possible ticker recycling; the ` +
          `terminal's basis may be wrong. Resolve by hand.`
      );
    }
  }

  // Stable, sorted output for clean diffs.
  const sorted: Record<string, Record<string, number>> = {};
  for (const end of Object.keys(store).sort()) {
    sorted[end] = {};
    for (const ticker of Object.keys(store[end]).sort()) sorted[end][ticker] = store[end][ticker];
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");

  const sortedTerminals: TerminalStore = {};
  for (const t of Object.keys(terminals).sort()) sortedTerminals[t] = terminals[t];
  fs.writeFileSync(TERMINALS_FILE, JSON.stringify(sortedTerminals, null, 2) + "\n");

  console.log(
    `Wrote ${OUT_FILE}: ${Object.keys(sorted).length} end-dates, ${filled} (end-date, ticker) closes filled.`
  );
  console.log(
    `Wrote ${TERMINALS_FILE}: ${Object.keys(sortedTerminals).length} terminals (${terminal} new), ` +
      `${gaps} unresolved pair(s) (data gap or unconfirmed delisting — retried next run).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
