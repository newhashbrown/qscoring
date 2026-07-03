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
import { isRegularSessionOpen, isUsTradingDay, marketCloseDate } from "../lib/market-date";
import { publishMoversForDate, moversFileToRows } from "../lib/movers-live";
import { chooseLedgerPrice } from "../lib/snapshot-price";
import type { MoversFile } from "../lib/movers-board";
import type { CompanyHeader } from "../lib/scoring/types";
import { fetchUniverse, MAX_UNIVERSE_SIZE } from "../lib/scoring/universe";
import { assertSectorConcentration, sectorCounts } from "../lib/scoring/universe-guards";

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

// UniverseEntry mirrors the form's UniverseEntry type. Written to
// data/compare-universe.json so the /compare form has a stable allow-list
// that doesn't lose names when /api/score transiently fails for a ticker
// during the scoring loop below.
type UniverseEntry = {
  symbol: string;
  name: string;
  sector?: string;
};

// Resolve the investable universe via the shared selector (lib/scoring/
// universe.ts): funds/ETFs excluded, fetched deep and capped to the top-800
// REAL equities AFTER exclusions. build-universe-stats.ts uses the SAME
// selector with the SAME options, so the scored universe and its z-score
// normalization corpus stay identical by construction. This replaces two
// copy-pasted screener blocks that had drifted — one omitted the fund/ETF
// exclusion, leaving ~53% of the "universe" as mutual-fund share classes.
// See docs/diagnosis/universe-fund-etf-contamination.md.
async function fetchScreenerUniverse(): Promise<readonly UniverseEntry[]> {
  // No outer timeout here: fetchUniverse owns a per-attempt timeout and a
  // 429/5xx retry-with-backoff (waits can total minutes by design — a burst
  // 429 on this single call cost the 2026-07-01 snapshot). An outer 25s
  // abort would kill the retry loop mid-backoff and defeat it.
  const universe = await fetchUniverse({
    maxSize: MAX_UNIVERSE_SIZE,
    requireSector: true,
  });

  const entries: UniverseEntry[] = universe.map((e) => ({
    symbol: e.symbol,
    name: e.companyName,
    ...(e.sector ? { sector: e.sector } : {}),
  }));

  // Fail fast before the ~27-minute scoring loop if the universe is
  // contaminated (the headline symptom is a single sector — Financial Services
  // — ballooning past its ceiling). fetchUniverse already enforces no
  // funds/ETFs; this catches a contaminated *distribution* before we spend the
  // scoring budget on it.
  assertSectorConcentration(sectorCounts(entries), entries.length);

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
  header?: CompanyHeader;
  // Settled EOD close for the ledger (see lib/snapshot-price.ts). Optional so
  // a pre-deploy /api/score that predates these fields still scores.
  settledClose?: number | null;
  settledChangePercent?: number | null;
  settledCloseDate?: string | null;
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
  // Tier 1a point-in-time header scalars, captured into the append-only
  // snapshot ledger. Optional so a pre-header /api/score response still scores.
  header?: CompanyHeader;
};

// What fetchScore returns: a Pick plus the settled-close fields the ledger
// builder needs to choose a timing-independent close. The settled fields are
// stripped before a Pick is frozen, so the snapshot's shape is unchanged.
type ScoredPick = Pick & {
  settledClose: number | null;
  settledChangePercent: number | null;
  settledCloseDate: string | null;
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

async function fetchScore(ticker: string): Promise<ScoredPick | null> {
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
      ...(data.header ? { header: data.header } : {}),
      settledClose: data.settledClose ?? null,
      settledChangePercent: data.settledChangePercent ?? null,
      settledCloseDate: data.settledCloseDate ?? null,
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

  // Delayed-into-session guard, enforced in code (not only in the workflow
  // YAML) so a direct `npm run strong-picks` can't contaminate the ledger
  // either. /api/score reads price/changePercent from FMP /quote (live
  // intraday), but marketCloseDate() labels the snapshot with the PRIOR
  // session — faithful only while the market is CLOSED. If this runs inside
  // 09:30–16:00 ET, those live prices get frozen under a prior-close label
  // (the 2026-06-22 contamination). Unlike the non-trading-day skip above,
  // FORCE_RUN does NOT override this: there is no safe in-session live rescore;
  // deliberate backfills go through scripts/backfill-snapshots.ts.
  if (isRegularSessionOpen(new Date())) {
    console.error(
      "Refusing to score: a regular trading session is open (09:30–16:00 ET). " +
        "FMP /quote returns LIVE INTRADAY prices that would be frozen under the " +
        "prior-close label and poison the no-look-ahead ledger. Run pre-market, " +
        "or backfill from FMP historical close via scripts/backfill-snapshots.ts."
    );
    process.exit(1);
  }

  const universe = await fetchScreenerUniverse();
  const generatedAt = new Date().toISOString();
  // The labeled close date for this run (prior trading day pre-market, today
  // after close). Used both to name the snapshot file (below) and to pick the
  // settled EOD close for each ticker's ledger price.
  const snapshotDate = marketCloseDate(generatedAt);

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
  // Freeze the SETTLED EOD close into the ledger, not the live /quote price.
  // chooseLedgerPrice uses the settled close when its EOD bar matches
  // snapshotDate (the common pre-market case, and the in-session case where the
  // settled prior close — not the live intraday print — is correct), and falls
  // back to the live quote otherwise. The settled fields are stripped so the
  // stored Pick shape is unchanged. See lib/snapshot-price.ts.
  const picks: Pick[] = [];
  let settledCount = 0;
  let liveCount = 0;
  for (const entry of universe) {
    const scored = await fetchScore(entry.symbol);
    if (scored) {
      const chosen = chooseLedgerPrice({
        snapshotDate,
        settled: {
          date: scored.settledCloseDate,
          close: scored.settledClose,
          changePercent: scored.settledChangePercent,
        },
        livePrice: scored.price,
        liveChangePercent: scored.changePercent,
      });
      if (chosen.source === "settled") settledCount++;
      else liveCount++;
      const { settledClose: _c, settledChangePercent: _cp, settledCloseDate: _cd, ...pick } = scored;
      picks.push({ ...pick, price: chosen.price, changePercent: chosen.changePercent });
    }
    await sleep(REQUEST_GAP_MS);
  }
  console.log(
    `Ledger close source for ${snapshotDate}: ${settledCount} settled EOD, ${liveCount} live fallback.`
  );

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
  // (snapshotDate is computed once near the top of main(), before scoring.)
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
