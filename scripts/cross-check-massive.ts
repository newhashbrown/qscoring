/**
 * Nightly cross-check of FMP vs Massive market data for the popular-ticker
 * universe. Diffs the most recent EOD close + volume from each source and
 * writes a structured report to data/source-comparison/{YYYY-MM-DD}.json.
 *
 * Run locally:  npx tsx scripts/cross-check-massive.ts [--limit 50]
 *
 * If close prices routinely disagree by >0.5%, the two sources are likely
 * surfacing different bars (e.g. consolidated vs primary-exchange) and you
 * have a data-quality decision to make before either can be trusted as a
 * fallback.
 */
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

import { fmp } from "../lib/scoring/fmp";
import { massive } from "../lib/massive/client";

const OUTLIER_PCT = 0.5;          // close-price disagreement worth flagging
const STALE_DAYS = 7;             // either source dating older than this is suspicious
const MASSIVE_RATE_PER_MIN = 5;   // free-tier hard cap; bump if you upgrade
const PER_TICKER_MS = Math.ceil(60_000 / MASSIVE_RATE_PER_MIN) + 1_000; // 13s
const RATE_LIMIT_BACKOFF_MS = 65_000;  // > 1min so the bucket fully refills

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / 86_400_000;
}

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT =
  limitIdx >= 0 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : 50;

type Row = {
  symbol: string;
  status: "ok" | "fmp_missing" | "massive_missing" | "both_missing" | "error";
  fmpError?: string;
  massiveError?: string;
  fmp?: { date: string; close: number; volume: number };
  massive?: { date: string; close: number; volume: number };
  closeDiffPct?: number;   // (massive - fmp) / fmp * 100
  volumeDiffPct?: number;
  staleDays?: number;      // max age (days) of either source's reported date
};

async function massiveWithRetry(symbol: string) {
  try {
    return { ok: true as const, data: await massive.prevClose(symbol) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429")) {
      // One retry after the rate-limit window resets.
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
      try {
        return { ok: true as const, data: await massive.prevClose(symbol) };
      } catch (e2) {
        return { ok: false as const, error: e2 instanceof Error ? e2.message : String(e2) };
      }
    }
    return { ok: false as const, error: msg };
  }
}

async function check(symbol: string): Promise<Row> {
  const [fmpRes, massiveRes] = await Promise.all([
    fmp.historical(symbol).then(
      (d) => ({ ok: true as const, data: d }),
      (e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })
    ),
    massiveWithRetry(symbol),
  ]);

  const fmpLatest = fmpRes.ok ? fmpRes.data?.[0] ?? null : null;
  const massivePrev = massiveRes.ok ? massiveRes.data : null;
  const fmpError = fmpRes.ok ? undefined : fmpRes.error;
  const massiveError = massiveRes.ok ? undefined : massiveRes.error;

  if (!fmpLatest && !massivePrev) {
    return { symbol, status: "both_missing", fmpError, massiveError };
  }
  if (!fmpLatest) {
    return {
      symbol,
      status: "fmp_missing",
      fmpError,
      massive: {
        date: new Date(massivePrev!.t).toISOString().slice(0, 10),
        close: massivePrev!.c,
        volume: massivePrev!.v,
      },
    };
  }
  if (!massivePrev) {
    return {
      symbol,
      status: "massive_missing",
      massiveError,
      fmp: {
        date: fmpLatest.date,
        close: fmpLatest.price,
        volume: fmpLatest.volume,
      },
    };
  }

    const closeDiffPct = ((massivePrev.c - fmpLatest.price) / fmpLatest.price) * 100;
    const volumeDiffPct =
      fmpLatest.volume > 0
        ? ((massivePrev.v - fmpLatest.volume) / fmpLatest.volume) * 100
        : 0;
    const massiveDate = new Date(massivePrev.t).toISOString().slice(0, 10);
    const staleDays = Math.max(daysSince(fmpLatest.date), daysSince(massiveDate));

    return {
      symbol,
      status: "ok",
      fmp: { date: fmpLatest.date, close: fmpLatest.price, volume: fmpLatest.volume },
      massive: { date: massiveDate, close: massivePrev.c, volume: massivePrev.v },
      closeDiffPct,
      volumeDiffPct,
      staleDays: Number(staleDays.toFixed(1)),
    };
}

async function main() {
  const tickersPath = path.resolve(process.cwd(), "data", "popular-tickers.json");
  const tickers: string[] = JSON.parse(fs.readFileSync(tickersPath, "utf-8"))
    .slice(0, LIMIT);

  const etaMin = Math.ceil((tickers.length * PER_TICKER_MS) / 60_000);
  console.log(
    `Cross-checking ${tickers.length} tickers serially at ~${MASSIVE_RATE_PER_MIN}/min ` +
      `(ETA ~${etaMin} min)...`
  );

  const rows: Row[] = [];
  const startedAt = Date.now();
  for (let i = 0; i < tickers.length; i++) {
    const tickerStart = Date.now();
    const row = await check(tickers[i]);
    rows.push(row);
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    process.stdout.write(
      `\r  ${rows.length}/${tickers.length} (${elapsedSec}s elapsed)   `
    );

    if (i < tickers.length - 1) {
      const waitFor = PER_TICKER_MS - (Date.now() - tickerStart);
      if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
    }
  }
  process.stdout.write("\n");

  // Aggregate stats
  const okRows = rows.filter((r) => r.status === "ok");
  const closeDiffs = okRows.map((r) => Math.abs(r.closeDiffPct!));
  const meanAbsCloseDiff =
    closeDiffs.length > 0
      ? closeDiffs.reduce((a, b) => a + b, 0) / closeDiffs.length
      : 0;
  const maxAbsCloseDiff = closeDiffs.length > 0 ? Math.max(...closeDiffs) : 0;
  const outliers = okRows.filter((r) => Math.abs(r.closeDiffPct!) > OUTLIER_PCT);
  const staleRows = okRows.filter((r) => (r.staleDays ?? 0) > STALE_DAYS);

  const report = {
    generatedAt: new Date().toISOString(),
    config: { limit: LIMIT, outlierThresholdPct: OUTLIER_PCT, staleDaysThreshold: STALE_DAYS },
    summary: {
      total: rows.length,
      ok: okRows.length,
      fmpMissing: rows.filter((r) => r.status === "fmp_missing").length,
      massiveMissing: rows.filter((r) => r.status === "massive_missing").length,
      bothMissing: rows.filter((r) => r.status === "both_missing").length,
      errors: rows.filter((r) => r.status === "error").length,
      meanAbsCloseDiffPct: Number(meanAbsCloseDiff.toFixed(4)),
      maxAbsCloseDiffPct: Number(maxAbsCloseDiff.toFixed(4)),
      outlierCount: outliers.length,
      staleCount: staleRows.length,
    },
    outliers: outliers
      .sort((a, b) => Math.abs(b.closeDiffPct!) - Math.abs(a.closeDiffPct!))
      .map((r) => ({
        symbol: r.symbol,
        closeDiffPct: Number(r.closeDiffPct!.toFixed(4)),
        fmpClose: r.fmp!.close,
        massiveClose: r.massive!.close,
        fmpDate: r.fmp!.date,
        massiveDate: r.massive!.date,
        staleDays: r.staleDays,
      })),
    stale: staleRows
      .sort((a, b) => (b.staleDays ?? 0) - (a.staleDays ?? 0))
      .map((r) => ({
        symbol: r.symbol,
        staleDays: r.staleDays,
        fmpDate: r.fmp!.date,
        massiveDate: r.massive!.date,
      })),
    rows,
  };

  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(process.cwd(), "data", "source-comparison");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\nReport: ${outPath}`);
  console.log(`  OK:                    ${report.summary.ok}/${report.summary.total}`);
  console.log(`  Mean |close diff|:     ${report.summary.meanAbsCloseDiffPct}%`);
  console.log(`  Max |close diff|:      ${report.summary.maxAbsCloseDiffPct}%`);
  console.log(`  Outliers (>${OUTLIER_PCT}%):    ${report.summary.outlierCount}`);
  console.log(`  Stale (>${STALE_DAYS}d):         ${report.summary.staleCount}`);
  if (outliers.length > 0) {
    console.log("\nTop outliers:");
    for (const o of report.outliers.slice(0, 10)) {
      console.log(
        `  ${o.symbol.padEnd(6)} fmp=${o.fmpClose} massive=${o.massiveClose} diff=${o.closeDiffPct}%`
      );
    }
  }
  if (staleRows.length > 0) {
    console.log("\nStale tickers (likely renamed/delisted):");
    for (const s of report.stale.slice(0, 10)) {
      console.log(
        `  ${s.symbol.padEnd(6)} ${s.staleDays}d old (fmp=${s.fmpDate}, massive=${s.massiveDate})`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
