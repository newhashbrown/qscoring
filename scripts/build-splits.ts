/**
 * Builds data/splits.json — the split-basis store the forward-return engine,
 * weekly recap, and exit-price builder consume (issue #76, lib/splits.ts).
 *
 * For every FMP-reported split touching a ticker the snapshot ledger has ever
 * carried, records:
 *   - `fmpDate`: FMP's official effective date (bars before it are adjusted).
 *   - `date`: the LEDGER basis boundary — the first snapshot whose frozen
 *     price is on the NEW basis. Detected from the ledger itself by finding
 *     the consecutive-snapshot price jump that matches the split ratio,
 *     because the boundary can differ from fmpDate (the as-of rebuilt
 *     2026-07-01 snapshot took FMP-adjusted prices, flipping its basis a
 *     session before CRWD's official 07-02 date).
 *
 * Also a tripwire: any >40% consecutive-snapshot price jump with NO matching
 * split on record is loudly warned — a possible unrecorded corporate action.
 *
 * Idempotent: merges into the existing store without churning already-
 * detected boundaries, rewrites sorted. Committed JSON, part of the ledger.
 *
 * Run:  FMP_API_KEY=… npx tsx scripts/build-splits.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { detectLedgerBoundary, type SplitEvent, type SplitStore } from "../lib/splits";

const SNAP_DIR = path.resolve(process.cwd(), "data", "snapshots");
const OUT_FILE = path.resolve(process.cwd(), "data", "splits.json");
const FMP_BASE = "https://financialmodelingprep.com/stable";
const REQUEST_TIMEOUT_MS = 10_000;
const CALENDAR_CHUNK_DAYS = 80; // stay under FMP's ~90-day range cap
const REQUEST_GAP_MS = 300;

// Tripwire: |move| beyond this without a split on record → loud warning.
const LOG_JUMP_THRESHOLD = Math.log(1 / 0.6); // ≈ ±40% down / +67% up

// console.warn + a ::warning:: line so GitHub Actions surfaces it as a run
// annotation instead of burying it in the step log — these warnings are the
// only signal when the store refuses/misses an event.
function warnLoudly(message: string): void {
  console.warn(message);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
}

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY is not set — required to fetch the splits calendar.");
  return key;
}

const addDays = (date: string, n: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .split("T")[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function snapshotDates(): string[] {
  if (!fs.existsSync(SNAP_DIR)) return [];
  return fs
    .readdirSync(SNAP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** ticker → ascending [snapshotDate, frozenPrice] series across the ledger. */
function priceSeries(dates: string[]): Map<string, Array<[string, number]>> {
  const series = new Map<string, Array<[string, number]>>();
  for (const date of dates) {
    const raw = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, `${date}.json`), "utf-8"));
    for (const p of (raw.picks ?? []) as Array<{ ticker: string; price: number }>) {
      if (!(typeof p.price === "number" && p.price > 0)) continue;
      if (!series.has(p.ticker)) series.set(p.ticker, []);
      series.get(p.ticker)!.push([date, p.price]);
    }
  }
  return series;
}

type CalendarRow = { symbol?: string; date?: string; numerator?: number; denominator?: number };

async function fetchCalendarChunk(from: string, to: string): Promise<CalendarRow[]> {
  const url = `${FMP_BASE}/splits-calendar?from=${from}&to=${to}&apikey=${getApiKey()}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
      () => null
    );
    if (res?.ok) {
      const json = (await res.json().catch(() => null)) as CalendarRow[] | null;
      if (!Array.isArray(json)) {
        // A 200 with an unexpected body (FMP error-wrapped JSON) is NOT the
        // same as "no splits this window" — say so instead of silently
        // returning nothing; the next daily run retries the whole window.
        warnLoudly(`splits-calendar ${from}→${to}: HTTP 200 but non-array body — treating as empty.`);
        return [];
      }
      return json;
    }
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 2) {
      throw new Error(`splits-calendar ${from}→${to} failed: HTTP ${res?.status ?? "network"}`);
    }
    await sleep(5_000 * (attempt + 1));
  }
}

async function fetchSplits(from: string, to: string): Promise<CalendarRow[]> {
  const rows: CalendarRow[] = [];
  let chunkFrom = from;
  while (chunkFrom <= to) {
    const chunkTo = addDays(chunkFrom, CALENDAR_CHUNK_DAYS - 1) < to
      ? addDays(chunkFrom, CALENDAR_CHUNK_DAYS - 1)
      : to;
    rows.push(...(await fetchCalendarChunk(chunkFrom, chunkTo)));
    chunkFrom = addDays(chunkTo, 1);
    if (chunkFrom <= to) await sleep(REQUEST_GAP_MS);
  }
  return rows;
}

async function main() {
  const dates = snapshotDates();
  if (dates.length === 0) {
    console.log("No snapshots — nothing to do.");
    return;
  }
  const series = priceSeries(dates);
  const today = new Date().toISOString().split("T")[0];

  const store: SplitStore = {};
  if (fs.existsSync(OUT_FILE)) {
    try {
      Object.assign(store, JSON.parse(fs.readFileSync(OUT_FILE, "utf-8")));
    } catch {
      /* corrupt → rebuild from scratch */
    }
  }

  console.log(`Fetching FMP splits calendar ${dates[0]} → ${today}…`);
  const calendar = await fetchSplits(dates[0], today);

  let added = 0;
  let fallbacks = 0;
  for (const row of calendar) {
    const { symbol, date: fmpDate, numerator, denominator } = row;
    if (!symbol || !fmpDate || !series.has(symbol)) continue;
    if (!(typeof numerator === "number" && numerator > 0)) continue;
    if (!(typeof denominator === "number" && denominator > 0)) continue;
    const ratio = numerator / denominator;
    if (ratio === 1) continue;

    // Already recorded? Deliberately checked BEFORE detection so an already-
    // committed boundary never churns — the cost is that a wrongly recorded
    // event stays until data/splits.json is edited by hand (it is committed
    // JSON precisely so such an edit is reviewable). Refused/missed events
    // are NOT recorded, so they re-evaluate on every run and self-heal.
    const existing = store[symbol] ?? [];
    if (existing.some((e) => e.fmpDate === fmpDate)) continue;

    const tickerSeries = series.get(symbol)!;
    const { boundary, scanned } = detectLedgerBoundary(tickerSeries, fmpDate, ratio);

    let ledgerDate = boundary;
    if (!ledgerDate) {
      if (scanned) {
        // The ledger has consecutive frozen prices around the date and they
        // never re-based → the FMP record doesn't apply to this ledger.
        // Recording it would FABRICATE a phantom, so skip loudly.
        warnLoudly(
          `${symbol}: FMP reports ${numerator}:${denominator} @ ${fmpDate} but the ledger ` +
            `shows no re-basing around it — skipped (nothing to correct). If this name is ` +
            `still in the universe, verify the frozen prices by hand.`
        );
        continue;
      }
      // No pre-split frozen price at all → every snapshot is already post-
      // split; nothing to correct.
      const hasPreSplitSnapshot = tickerSeries.some(([d]) => d < fmpDate);
      if (!hasPreSplitSnapshot) continue;
      // Present before the split but gone from the universe around it, so
      // detection had nothing to scan. The exit-price store still needs the
      // basis flip: fall back to the first snapshot date ≥ fmpDate.
      ledgerDate = dates.find((d) => d >= fmpDate) ?? null;
      if (!ledgerDate) continue; // split newer than the whole ledger — next run
      fallbacks += 1;
      warnLoudly(
        `${symbol}: ${numerator}:${denominator} @ ${fmpDate} — name left the universe around ` +
          `the split; fallback boundary ${ledgerDate} (drives exit-store basis conversion).`
      );
    }

    const event: SplitEvent = { date: ledgerDate, numerator, denominator, fmpDate };
    store[symbol] = [...existing, event].sort((a, b) => a.date.localeCompare(b.date));
    added += 1;
    console.log(
      `${symbol}: recorded ${numerator}:${denominator} — ledger boundary ${ledgerDate} (FMP ${fmpDate}).`
    );
  }

  // Tripwire: big consecutive-snapshot jumps with no split on record.
  let suspicious = 0;
  for (const [ticker, s] of series) {
    for (let i = 1; i < s.length; i++) {
      const [d1, p1] = s[i - 1];
      const [d2, p2] = s[i];
      if (Math.abs(Math.log(p1 / p2)) <= LOG_JUMP_THRESHOLD) continue;
      const covered = (store[ticker] ?? []).some((e) => e.date === d2);
      if (covered) continue;
      suspicious += 1;
      warnLoudly(
        `TRIPWIRE ${ticker}: ${d1} ${p1} → ${d2} ${p2} is a >40% basis-scale jump with no ` +
          `split on record — possible unrecorded corporate action.`
      );
    }
  }

  // Stable, sorted output for clean diffs.
  const sorted: SplitStore = {};
  for (const ticker of Object.keys(store).sort()) sorted[ticker] = store[ticker];
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(
    `Wrote ${OUT_FILE}: ${Object.keys(sorted).length} tickers, +${added} new events ` +
      `(${fallbacks} fallback boundaries), ${suspicious} tripwire warning(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
