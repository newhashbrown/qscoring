/**
 * Factor-panel exporter for the offline backtest harness (research/).
 *
 * Emits a wide factor panel + a price panel + a provenance meta sidecar that the
 * Python firewall (research/lib/panel.py) reads to decide whether the panel may
 * be used for publishable analysis.
 *
 * Two sources:
 *   --source snapshots   (default) Flatten data/snapshots/*.json. POINT-IN-TIME
 *                        clean — each score was computed live that day. This is
 *                        the publishable "path of record". provenance=forward.
 *   --source backward    Re-derive momentum + risk scores from FMP price history
 *                        truncated to each as-of date. DIAGNOSTIC ONLY (survivor-
 *                        ship + stale-normalization bias). provenance=
 *                        backward_diagnostic, factors_valid=[momentum, risk].
 *                        Fundamentals are NOT re-derived (FMP TTM is current-only
 *                        → structurally not point-in-time). Beta is excluded
 *                        (FMP beta is a current 5y figure → not as-of safe).
 *
 * Outputs (under research/data/, gitignored):
 *   factor_panel_<source>.csv        date,ticker,sector,value,growth,momentum,
 *                                     profitability,risk,composite,long_score,short_score,price
 *   prices_<source>.csv              date,ticker,close   (+ SPY)
 *   factor_panel_<source>.meta.json  provenance / factors_valid / bias / ...
 *
 * Usage:
 *   npm run research:export -- --source snapshots --max-tickers 150
 *   npm run research:export -- --source backward --asof-start 2025-01-01 \
 *       --asof-end 2026-05-01 --step 21 --max-tickers 60
 *
 * Style mirrors scripts/build-universe-stats.ts (manual .env load, fmp.* calls,
 * paced fetching).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { fmp, type PricePoint } from "../../lib/scoring/fmp";
import {
  return1mo,
  return3mo,
  return12mo,
  rsi14,
  realizedVolatility,
  maCrossover,
} from "../../lib/scoring/momentum";
import {
  getStats,
  scoreHigher,
  scoreLower,
  scoreRsi,
  scoreMaCross,
  type MetricKey,
} from "../../lib/scoring/zscore";
import { listSnapshotDates, loadSnapshot } from "../../lib/performance";
// Phase-2 factor variants (stubs until Agents A/B implement). Emitted as
// backward-panel sub-component columns so the harness reports each one's IC.
import { volScaledMomentum12_1 } from "../../lib/scoring/momentum-factor";
import { ewmaVolatility } from "../../lib/scoring/risk-factor";

// ── env (manual, mirrors build-universe-stats.ts) ─────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

// ── args ──────────────────────────────────────────────────────────────────
function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SOURCE = arg("source", "snapshots");
const MAX_TICKERS = Number(arg("max-tickers", "150"));
const CONCURRENCY = Number(arg("concurrency", "3"));
const DELAY_MS = Number(arg("delay", "400"));
const ASOF_START = arg("asof-start", "2025-01-01");
const ASOF_END = arg("asof-end", "2026-05-01");
const STEP_DAYS = Number(arg("step", "21"));

const OUT_DIR = path.resolve(process.cwd(), "research", "data");
const FACTOR_COLS = [
  "value", "growth", "momentum", "profitability", "risk",
  "composite", "long_score", "short_score", "price",
] as const;

// Intra-category metric weights — MUST mirror lib/scoring/score.ts. Duplicated
// (not imported) only because score.ts doesn't export its metric specs;
// exporting them is a Phase-2 refactor candidate. Keep in sync.
const MOMENTUM_WEIGHTS = { return12mo: 1.5, return3mo: 1.2, return1mo: 1.0, rsi14: 1.0, maCross: 1.0 };
const RISK_WEIGHTS_NO_BETA = { vol60: 1.2 }; // beta omitted: not as-of safe

type Row = Record<string, string | number | null>;

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeCsv(file: string, headers: string[], rows: Row[]) {
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => (r[h] === null || r[h] === undefined ? "" : String(r[h]))).join(","));
  }
  fs.writeFileSync(path.join(OUT_DIR, file), lines.join("\n") + "\n");
}

function sortNewestFirst(h: PricePoint[]): PricePoint[] {
  return [...h].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Run an async mapper with bounded concurrency + pacing (FMP-friendly).
async function paced<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    out.push(...(await Promise.all(batch.map(fn))));
    if (i + CONCURRENCY < items.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  return out;
}

function weightedAvg(parts: Array<{ score: number | null; weight: number }>): number | null {
  let ws = 0;
  let ss = 0;
  for (const p of parts) {
    if (p.score === null || !Number.isFinite(p.score)) continue;
    ws += p.weight;
    ss += p.weight * p.score;
  }
  return ws > 0 ? ss / ws : null;
}

// ── FORWARD: flatten the committed daily snapshots (publishable) ───────────
async function exportSnapshots() {
  const dates = listSnapshotDates();
  if (dates.length === 0) throw new Error("No snapshots in data/snapshots/.");

  const rows: Row[] = [];
  const tickers = new Set<string>();
  for (const date of dates) {
    const snap = loadSnapshot(date);
    if (!snap) continue;
    for (const p of snap.picks) {
      tickers.add(p.ticker);
      const cat = (name: string) => p.categories.find((c) => c.name === name)?.score ?? null;
      rows.push({
        date,
        ticker: p.ticker,
        sector: p.sector ?? "",
        value: cat("value"),
        growth: cat("growth"),
        momentum: cat("momentum"),
        profitability: cat("profitability"),
        risk: cat("risk"),
        composite: p.composite,
        long_score: p.longTermScore ?? null,
        short_score: p.shortTermScore ?? null,
        price: p.price,
      });
    }
  }

  const universe = [...tickers].slice(0, MAX_TICKERS);
  const panelRows = rows.filter((r) => universe.includes(r.ticker as string));
  writeCsv("factor_panel_snapshots.csv", ["date", "ticker", "sector", ...FACTOR_COLS], panelRows);

  await writePrices("prices_snapshots.csv", universe);

  writeMeta("factor_panel_snapshots.meta.json", {
    provenance: "forward",
    factors_valid: ["value", "growth", "momentum", "profitability", "risk", "composite"],
    bias: [],
    source: `snapshots(${dates.length} days, ${dates[0]}..${dates.at(-1)})`,
    universe_size: universe.length,
    notes:
      "Point-in-time: each score was computed live that day. Forward returns accrue " +
      "as more sessions are captured; short windows will report 'insufficient data'.",
  });
  console.log(`forward panel: ${panelRows.length} rows, ${universe.length} tickers, ${dates.length} dates`);
}

// ── BACKWARD: re-derive momentum + risk from truncated history (DIAGNOSTIC) ─
async function exportBackward() {
  const sbPath = path.resolve(process.cwd(), "data", "scoreboard.json");
  const scoreboard = JSON.parse(fs.readFileSync(sbPath, "utf-8")) as {
    picks: Array<{ ticker: string; sector?: string }>;
  };
  const universe = scoreboard.picks.slice(0, MAX_TICKERS);

  const asofDates = buildAsofSchedule(ASOF_START, ASOF_END, STEP_DAYS);
  const rows: Row[] = [];
  const priceRows: Row[] = [];

  await paced(universe, async ({ ticker, sector }) => {
    const history = await fmp.historical(ticker).catch(() => [] as PricePoint[]);
    if (history.length === 0) return null;
    const sorted = sortNewestFirst(history);
    // price panel: emit every available close (AlphaLens computes forward returns)
    for (const pt of sorted) priceRows.push({ date: pt.date, ticker, close: pt.price });

    for (const asof of asofDates) {
      const upto = sorted.filter((p) => p.date <= asof);
      if (upto.length < 252) continue; // need a year for the 12-month metric
      const r12 = return12mo(upto);
      const r3 = return3mo(upto);
      const r1 = return1mo(upto);
      const rsi = rsi14(upto);
      const sma50 = smaFromHistory(upto, 50);
      const sma200 = smaFromHistory(upto, 200);
      const golden = maCrossover(sma50, sma200);
      const vol = realizedVolatility(upto);

      const sec = sector ?? null;
      const stat = (k: MetricKey) => getStats(k, sec);
      // Legacy momentum sub-component scores (each emitted for per-sub IC).
      const momRet12 = scoreHigher(r12, stat("return12mo"));
      const momRet3 = scoreHigher(r3, stat("return3mo"));
      const momRet1 = scoreHigher(r1, stat("return1mo"));
      const momRsi = scoreRsi(rsi);
      const momMaCross = scoreMaCross(golden);
      const momentum = weightedAvg([
        { score: momRet12, weight: MOMENTUM_WEIGHTS.return12mo },
        { score: momRet3, weight: MOMENTUM_WEIGHTS.return3mo },
        { score: momRet1, weight: MOMENTUM_WEIGHTS.return1mo },
        { score: momRsi, weight: MOMENTUM_WEIGHTS.rsi14 },
        { score: momMaCross, weight: MOMENTUM_WEIGHTS.maCross },
      ]);
      const riskVol = scoreLower(vol, stat("vol60"));
      const risk = weightedAvg([{ score: riskVol, weight: RISK_WEIGHTS_NO_BETA.vol60 }]);
      // v2 raw signals (null until Agents A/B implement the stub modules).
      const momVolScaled = volScaledMomentum12_1(upto);
      const riskVolEwma = ewmaVolatility(upto);
      if (momentum === null && risk === null) continue;
      rows.push({
        date: asof, ticker, sector: sector ?? "",
        value: null, growth: null, momentum, profitability: null, risk,
        composite: null, long_score: null, short_score: null,
        price: upto[0].price,
        // sub-component columns (backward diagnostic only):
        mom_ret12: momRet12, mom_ret3: momRet3, mom_ret1: momRet1,
        mom_rsi: momRsi, mom_macross: momMaCross, mom_volscaled: momVolScaled,
        risk_vol: riskVol, risk_vol_ewma: riskVolEwma,
      });
    }
    return null;
  });

  // SPY for the benchmark/drawdown leg.
  const spy = sortNewestFirst(await fmp.historical("SPY").catch(() => [] as PricePoint[]));
  for (const pt of spy) priceRows.push({ date: pt.date, ticker: "SPY", close: pt.price });

  const subCols = [
    "mom_ret12", "mom_ret3", "mom_ret1", "mom_rsi", "mom_macross", "mom_volscaled",
    "risk_vol", "risk_vol_ewma",
  ];
  writeCsv("factor_panel_backward.csv", ["date", "ticker", "sector", ...FACTOR_COLS, ...subCols], rows);
  writeCsv("prices_backward.csv", ["date", "ticker", "close"], priceRows);
  writeMeta("factor_panel_backward.meta.json", {
    provenance: "backward_diagnostic",
    factors_valid: ["momentum", "risk", ...subCols],
    bias: ["survivorship", "stale_normalization"],
    source: `backward(${ASOF_START}..${ASOF_END} step=${STEP_DAYS}d, ${universe.length} tickers)`,
    universe_size: universe.length,
    notes:
      "DIAGNOSTIC ONLY. Universe = current scoreboard survivors (survivorship bias). " +
      "Scores z-scored against CURRENT universe-stats.json (stale_normalization). " +
      "Beta excluded (FMP beta is a current 5y figure, not as-of safe). Fundamentals " +
      "NOT re-derived (FMP TTM is current-only / not point-in-time).",
  });
  console.log(`backward DIAGNOSTIC panel: ${rows.length} rows, ${universe.length} tickers, ${asofDates.length} as-of dates`);
}

// SMA over the most-recent `n` closes from newest-first history truncated to as-of.
function smaFromHistory(newestFirst: PricePoint[], n: number): number | null {
  if (newestFirst.length < n) return null;
  const slice = newestFirst.slice(0, n);
  return slice.reduce((s, p) => s + p.price, 0) / n;
}

function buildAsofSchedule(start: string, end: string, stepDays: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  while (d <= endD) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + stepDays);
  }
  return out;
}

// Shared: fetch daily closes for a ticker set and write the long price panel.
async function writePrices(file: string, universe: string[]) {
  const priceRows: Row[] = [];
  await paced(universe, async (ticker) => {
    const h = sortNewestFirst(await fmp.historical(ticker).catch(() => [] as PricePoint[]));
    for (const pt of h) priceRows.push({ date: pt.date, ticker, close: pt.price });
    return null;
  });
  const spy = sortNewestFirst(await fmp.historical("SPY").catch(() => [] as PricePoint[]));
  for (const pt of spy) priceRows.push({ date: pt.date, ticker: "SPY", close: pt.price });
  writeCsv(file, ["date", "ticker", "close"], priceRows);
}

function writeMeta(file: string, meta: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(OUT_DIR, file),
    JSON.stringify({ generated_at: new Date().toISOString(), ...meta }, null, 2) + "\n"
  );
}

async function main() {
  ensureOutDir();
  if (SOURCE === "snapshots") await exportSnapshots();
  else if (SOURCE === "backward") await exportBackward();
  else throw new Error(`Unknown --source "${SOURCE}" (expected snapshots|backward)`);
  console.log(`Wrote panel artifacts → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
