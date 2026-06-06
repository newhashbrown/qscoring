/**
 * Builds data/strong-picks.json — the homepage carousel's preranked list
 * of high-composite tickers. Hits the deployed /api/score endpoint rather
 * than calling FMP directly so per-ticker scoring uses the production
 * cache layer.
 *
 * The universe is resolved at run-time from FMP's company-screener using
 * the same criteria build-universe-stats.ts uses for z-score normalization
 * (US-listed, NASDAQ/NYSE, market cap > MIN_MARKET_CAP, actively trading).
 * Keeping these in lockstep means every ticker the form accepts is also
 * a ticker the normalization corpus has stats for. Requires FMP_API_KEY
 * at startup for the screener call; per-ticker scoring is still proxied
 * through /api/score.
 *
 * Designed to run from a daily GitHub Action. Can also be run locally:
 *   FMP_API_KEY=… npm run strong-picks
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { isUsTradingDay, marketCloseDate } from "../lib/market-date";
import { publishMoversForDate, moversFileToRows } from "../lib/movers-live";
import type { MoversFile } from "../lib/movers-board";

const BASE = process.env.QSCORING_BASE ?? "https://qscoring.com";

// Pacing for the cold-cache worst case: every ticker fans out to ~6 FMP
// calls inside /api/score. At 1 call/2s = 0.5 req/s, upstream FMP stays
// under ~3/s = 180/min, well below the 300/min Starter ceiling. The
// screener returns ~300-800 names at the current threshold, so worst-case
// pacing is ~27 min plus the post-deploy watchlist sleep + alert call.
const REQUEST_GAP_MS = 2000;
const REQUEST_TIMEOUT_MS = 25_000;
const RETRY_BACKOFF_MS = [15_000, 30_000];

// No hard composite threshold — the carousel shows the relative top of the
// universe so it stays populated even in choppy regimes when no names clear
// classic "buy" territory. The ranking itself communicates strength.
const LIMIT = 12;

// FMP company-screener endpoint and criteria — matches build-universe-stats.ts
// so the form-validation universe and the z-score normalization corpus stay
// identical. Available on the Starter plan (the /stable/sp500-constituent
// endpoint is not, hence the screener).
const SCREENER_URL = "https://financialmodelingprep.com/stable/company-screener";
const MIN_MARKET_CAP = 2_000_000_000;
const MAX_UNIVERSE_SIZE = 800;

// Sanity floor: the screener consistently returns ~300-400 names at the $2B
// threshold; anything materially below this means the response is malformed
// or the criteria silently changed — abort rather than ship a truncated
// scoreboard.
const MIN_EXPECTED_TICKERS = 200;

type ScreenerRow = {
  symbol: string;
  companyName?: string;
  sector?: string;
};

// UniverseEntry mirrors the form's UniverseEntry type. Written to
// data/compare-universe.json so the /compare form has a stable allow-list
// that doesn't lose names when /api/score transiently fails for a ticker
// during the scoring loop below.
type UniverseEntry = {
  symbol: string;
  name: string;
  sector?: string;
};

// FMP returns class shares as "BRK.B" / "BF.B"; FMP's score endpoints
// expect the hyphenated form ("BRK-B"). lib/scoring/fmp.ts does the same
// normalization for its own calls — mirror it here so /api/score gets the
// form it expects.
function normalizeSymbol(s: string): string {
  return s.replace(/\./g, "-");
}

async function fetchScreenerUniverse(): Promise<readonly UniverseEntry[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    throw new Error(
      "FMP_API_KEY is not set — required to resolve the screener universe. " +
        "Set it in the GitHub Actions secret store (same value used by refresh-universe-stats.yml)."
    );
  }
  const url = new URL(SCREENER_URL);
  url.searchParams.set("marketCapMoreThan", String(MIN_MARKET_CAP));
  url.searchParams.set("isActivelyTrading", "true");
  url.searchParams.set("country", "US");
  url.searchParams.set("exchange", "NASDAQ,NYSE");
  url.searchParams.set("limit", String(MAX_UNIVERSE_SIZE));
  url.searchParams.set("apikey", key);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Company-screener HTTP ${res.status}: ${text.slice(0, 200)}`
      );
    }
    body = await res.json();
  } finally {
    clearTimeout(timer);
  }

  if (!Array.isArray(body)) {
    throw new Error(
      `Company-screener response was not an array (got ${typeof body}). ` +
        "FMP endpoint shape may have changed."
    );
  }

  const tickerRe = /^[A-Z][A-Z0-9.-]{0,9}$/;
  const seen = new Set<string>();
  const entries: UniverseEntry[] = [];
  for (const row of body as ScreenerRow[]) {
    const raw = typeof row?.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    if (!raw) continue;
    const sym = normalizeSymbol(raw);
    if (!tickerRe.test(sym)) continue;
    if (seen.has(sym)) continue;
    seen.add(sym);
    const name = typeof row.companyName === "string" && row.companyName.trim() ? row.companyName.trim() : sym;
    const entry: UniverseEntry = { symbol: sym, name };
    if (typeof row.sector === "string" && row.sector.trim()) entry.sector = row.sector.trim();
    entries.push(entry);
  }

  if (entries.length < MIN_EXPECTED_TICKERS) {
    throw new Error(
      `Only ${entries.length} valid screener tickers parsed (expected ≥${MIN_EXPECTED_TICKERS}). ` +
        "Aborting to avoid shipping a truncated scoreboard."
    );
  }

  // Stable lexicographic order so downstream diffs (compare-universe.json,
  // scoreboard.json, snapshots) reflect score changes, not the upstream
  // API's ordering.
  entries.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return entries;
}

type CategoryName = "value" | "growth" | "momentum" | "profitability" | "risk";
type Signal = "BUY_LONG_TERM" | "BUY_SHORT_TERM" | "HOLD" | "SHORT";
type Confidence = "HIGH" | "MEDIUM" | "LOW";

type ApiCategory = {
  name: CategoryName;
  label: string;
  score: number;
};

type ApiResponse = {
  ticker: string;
  companyName: string;
  sector?: string;
  price: number;
  changePercent: number;
  composite: number;
  signal: Signal;
  confidence: Confidence;
  longTermScore: number;
  shortTermScore: number;
  categories: ApiCategory[];
  error?: string;
};

type Pick = {
  ticker: string;
  companyName: string;
  sector?: string;
  price: number;
  changePercent: number;
  composite: number;
  signal: Signal;
  confidence: Confidence;
  longTermScore: number;
  shortTermScore: number;
  categories: Array<{ name: CategoryName; label: string; score: number }>;
};

async function fetchScoreOnce(ticker: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE}/api/score/${encodeURIComponent(ticker)}`, {
      signal: ctrl.signal,
    });
  } catch (err) {
    console.warn(`[${ticker}] fetch failed:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchScore(ticker: string): Promise<Pick | null> {
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const res = await fetchScoreOnce(ticker);
    if (!res) return null;

    // Retry on 429 (FMP rate limit propagated through /api/score) and 503
    // (CF worker resource pressure). Both are transient.
    if ((res.status === 429 || res.status === 503) && attempt < RETRY_BACKOFF_MS.length) {
      const wait = RETRY_BACKOFF_MS[attempt];
      console.warn(`[${ticker}] HTTP ${res.status} — retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      console.warn(`[${ticker}] HTTP ${res.status} — skipping`);
      return null;
    }

    const data = (await res.json()) as ApiResponse;
    if (data.error || !Number.isFinite(data.composite)) {
      console.warn(`[${ticker}] no usable score — skipping`);
      return null;
    }
    return {
      ticker: data.ticker,
      companyName: data.companyName,
      ...(data.sector ? { sector: data.sector } : {}),
      price: data.price,
      changePercent: data.changePercent,
      composite: Math.round(data.composite),
      signal: data.signal,
      confidence: data.confidence,
      longTermScore: Math.round(data.longTermScore),
      shortTermScore: Math.round(data.shortTermScore),
      categories: data.categories.map((c) => ({
        name: c.name,
        label: c.label,
        score: Math.round(c.score),
      })),
    };
  }
  console.warn(`[${ticker}] exhausted retries — skipping`);
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Weekend crons resolve marketCloseDate to the prior Friday and used to
  // rewrite that frozen snapshot with a fresh `generatedAt` (and minor
  // float drift from re-scored cache reads). Skip the entire run on
  // non-trading days — also saves ~7 minutes of FMP-paced API calls per
  // weekend day. FORCE_RUN=1 overrides for local debugging.
  if (!isUsTradingDay(new Date()) && process.env.FORCE_RUN !== "1") {
    console.log("Non-trading day in ET — exiting without API calls or writes. Set FORCE_RUN=1 to override.");
    return;
  }

  const universe = await fetchScreenerUniverse();
  const generatedAt = new Date().toISOString();

  // Write compare-universe.json FIRST, from the screener output, so the
  // /compare form's allow-list reflects the full attempted universe even if
  // every subsequent /api/score call fails. Decoupling the form's gate from
  // the scoring loop is what prevents recurrences of the 2026-05-25 incident
  // where AAPL got dropped from scoreboard.json after one transient HTTP 500.
  const compareUniverseOutput = {
    generatedAt,
    universeSize: universe.length,
    entries: universe,
  };
  const compareUniversePath = path.resolve(process.cwd(), "data", "compare-universe.json");
  fs.writeFileSync(compareUniversePath, JSON.stringify(compareUniverseOutput, null, 2) + "\n");
  console.log(`Wrote ${universe.length} compare-universe entries → ${compareUniversePath}`);

  console.log(`Scanning ${universe.length} screener tickers via ${BASE}…`);
  const picks: Pick[] = [];
  for (const entry of universe) {
    const result = await fetchScore(entry.symbol);
    if (result) picks.push(result);
    await sleep(REQUEST_GAP_MS);
  }

  // Defensive invariant: if too many tickers dropped, refuse to clobber the
  // existing scoreboard. The cron's `git diff --staged --quiet` skip behavior
  // means the previous day's scoreboard survives intact rather than being
  // replaced with a degraded one. Threshold mirrors the same conservative
  // bar build-universe-stats uses for sector cohort viability.
  const MIN_OK_RATIO = 0.95;
  if (picks.length < universe.length * MIN_OK_RATIO) {
    console.error(
      `Universe coverage dropped below ${Math.round(MIN_OK_RATIO * 100)}%: ` +
        `${picks.length}/${universe.length}. Refusing to commit a degraded scoreboard. ` +
        `Investigate /api/score errors and re-run.`
    );
    process.exit(1);
  }

  const strong = picks
    .sort((a, b) => b.composite - a.composite || a.ticker.localeCompare(b.ticker))
    .slice(0, LIMIT);

  console.log(
    `Scored ${picks.length}/${universe.length} — top ${strong.length} composite range ${
      strong.at(-1)?.composite ?? 0
    }–${strong[0]?.composite ?? 0}`
  );

  const strongOutput = {
    generatedAt,
    universeSize: universe.length,
    picks: strong,
  };

  const strongPath = path.resolve(process.cwd(), "data", "strong-picks.json");
  fs.writeFileSync(strongPath, JSON.stringify(strongOutput, null, 2) + "\n");
  console.log(`Wrote ${strong.length} picks → ${strongPath}`);

  // Full universe scoreboard powers the /scores/[category] landing pages.
  // Sorted by ticker so diffs are stable day-to-day even when scores shift
  // — only the numeric values change, not the row order.
  const scoreboardOutput = {
    generatedAt,
    universeSize: universe.length,
    picks: [...picks].sort((a, b) => a.ticker.localeCompare(b.ticker)),
  };

  const scoreboardPath = path.resolve(process.cwd(), "data", "scoreboard.json");
  fs.writeFileSync(scoreboardPath, JSON.stringify(scoreboardOutput, null, 2) + "\n");
  console.log(`Wrote ${picks.length} scoreboard rows → ${scoreboardPath}`);

  // Tiny derived artifact for the site-wide MarketStrip (app/components/
  // MarketStrip.tsx). The strip renders in the root layout on every page and
  // only needs the universe-average composite — precomputing it here keeps the
  // full ~700KB scoreboard.json out of the layout's module graph.
  const averageComposite =
    picks.length > 0 ? picks.reduce((s, p) => s + p.composite, 0) / picks.length : 0;
  const marketStripPath = path.resolve(process.cwd(), "data", "market-strip.json");
  fs.writeFileSync(
    marketStripPath,
    JSON.stringify({ generatedAt, universeSize: universe.length, averageComposite }, null, 2) + "\n"
  );
  console.log(`Wrote market-strip average (${averageComposite.toFixed(2)}) → ${marketStripPath}`);

  // Locked-in daily snapshot — append-only ledger that powers /performance.
  // Same content as scoreboard.json, but date-stamped and never overwritten
  // after the day passes. This is the no-look-ahead-by-construction record:
  // every QScore and price below was committed to git at this date and can
  // be audited later against forward returns. The daily GitHub Action that
  // commits scoreboard.json also commits this file.
  //
  // Filename uses the US market close date in ET (not the raw UTC date)
  // because the script runs around 09:30 UTC = ~5:30am ET, which is past
  // midnight UTC for the previous trading day. Without the conversion the
  // file would be named 2026-05-09.json for what is actually the May 8
  // market close — visible to users as "Snapshot from tomorrow."
  const snapshotDate = marketCloseDate(generatedAt);
  const snapshotsDir = path.resolve(process.cwd(), "data", "snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  const snapshotPath = path.resolve(snapshotsDir, `${snapshotDate}.json`);
  // Enforce the append-only contract: once a date's snapshot is committed
  // it represents the no-look-ahead state for that close. Re-running (e.g.
  // a Mon-morning cron whose marketCloseDate still resolves to Fri because
  // it's before today's close) must not silently rewrite the frozen file.
  if (fs.existsSync(snapshotPath)) {
    console.log(`Snapshot ${snapshotDate}.json already exists — preserving frozen copy, skipping D1 persist.`);
  } else {
    fs.writeFileSync(snapshotPath, JSON.stringify(scoreboardOutput, null, 2) + "\n");
    console.log(`Wrote snapshot → ${snapshotPath}`);

    // Persist a queryable copy to D1 so /performance and future history
    // charts can read by ticker without scanning every snapshot JSON.
    // Best-effort — the JSON file above is the no-look-ahead source of
    // truth, so a D1 write failure must not fail the workflow or block
    // the git commit. Only persist on first write so we don't double-
    // insert into D1 if the script re-runs.
    await persistSnapshotToD1(snapshotDate, picks);

    // Publish the Movers vs. Fundamentals board: reconcile today's movers
    // against the prior snapshot and write data/movers/<date>.json + latest.json.
    // Best-effort and sequenced after the snapshot write — a failure here must
    // not fail the workflow or block the git commit.
    try {
      const moversFile = await publishMoversForDate(snapshotDate, generatedAt, picks);
      if (moversFile) {
        console.log(
          `Wrote movers → data/movers/${snapshotDate}.json ` +
            `(gainers ${moversFile.gainers.length}, losers ${moversFile.losers.length}, ` +
            `dollar-volume floor ${moversFile.dollarVolumeApplied ? "applied" : "skipped — volume unavailable"}).`
        );
        // D1 projection (queryable; never read at request time). Best-effort.
        await persistMoversToD1(moversFile);
      } else {
        console.log("Skipped movers: no prior snapshot to reconcile against.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Movers populate failed (non-fatal): ${msg}`);
    }
  }
}

async function persistSnapshotToD1(snapshotDate: string, picks: Pick[]): Promise<void> {
  const token = process.env.SNAPSHOT_CRON_TOKEN;
  if (!token) {
    console.warn("SNAPSHOT_CRON_TOKEN not set — skipping D1 persistence.");
    return;
  }
  if (picks.length === 0) {
    console.warn("No picks to persist — skipping D1 persistence.");
    return;
  }

  const url = `${BASE}/api/cron/persist-snapshot`;
  const body = JSON.stringify({ snapshotDate, picks });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`D1 persist failed HTTP ${res.status}: ${text.slice(0, 200)}`);
      return;
    }
    console.log(`D1 persist OK: ${text}`);
  } catch (err) {
    console.warn(`D1 persist threw: ${err instanceof Error ? err.message : err}`);
  } finally {
    clearTimeout(timer);
  }
}

async function persistMoversToD1(file: MoversFile): Promise<void> {
  const token = process.env.SNAPSHOT_CRON_TOKEN;
  if (!token) {
    console.warn("SNAPSHOT_CRON_TOKEN not set — skipping movers D1 persistence.");
    return;
  }
  const rows = moversFileToRows(file);
  if (rows.length === 0) {
    console.warn("No movers rows to persist — skipping movers D1 persistence.");
    return;
  }

  const url = `${BASE}/api/cron/persist-movers`;
  const body = JSON.stringify({ snapshotDate: file.date, rows });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`Movers D1 persist failed HTTP ${res.status}: ${text.slice(0, 200)}`);
      return;
    }
    console.log(`Movers D1 persist OK: ${text}`);
  } catch (err) {
    console.warn(`Movers D1 persist threw: ${err instanceof Error ? err.message : err}`);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
