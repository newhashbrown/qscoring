/**
 * Builds the universe stats file used by the QScore engine for z-score normalization.
 *
 * For each metric we compute mean, std dev, and count, both universe-wide and per-sector,
 * with light winsorization at the 5th/95th percentile to limit the impact of extreme
 * outliers (e.g. a P/E of 1000 on a single odd ticker).
 *
 * Run locally with:  npm run universe-stats
 * Run nightly via:   .github/workflows/refresh-universe-stats.yml
 * Output:            data/universe-stats.json
 *
 * Universe definition: mid+large-cap US-listed stocks (market cap > $2B, actively
 * trading) fetched from FMP's /stable/company-screener endpoint, capped at 800 names.
 * Mid-caps were added in May 2026 — under-followed names are exactly where a
 * quantitative second opinion adds the most value vs free analyst-driven alternatives.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "node:fs"; // placeholder; we read .env manually below

import { fmp, type Profile, type Quote, type RatiosTtm, type KeyMetricsTtm, type FinancialGrowth, type PricePoint } from "../lib/scoring/fmp";
import { return1mo, return3mo, return12mo, rsi14, realizedVolatility, maCrossover } from "../lib/scoring/momentum";

// Load .env manually so this script works without dotenv as a dep.
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

const MIN_MARKET_CAP = 2_000_000_000;
const MAX_UNIVERSE_SIZE = 800;
// FMP Starter is ~300 calls/min. Each ticker fires 5 parallel calls (skipping
// profile since the screener already gives sector+beta). At 2.5s pacing we
// run ~24 tickers/min × 5 calls = 120 calls/min — comfortably under the
// 300/min ceiling with headroom for retries and concurrent traffic.
//
// Total runtime for an 800-name universe: ~33 minutes. Fine for a nightly
// cron triggered after market close.
const CONCURRENCY = 1;
const BATCH_DELAY_MS = 2500;

type MetricKey =
  | "pe" | "pb" | "ps" | "evEbitda"
  | "revenueGrowth" | "epsGrowth" | "fcfGrowth"
  | "roe" | "roa" | "grossMargin" | "operatingMargin" | "netMargin" | "fcfYield"
  | "return12mo" | "return3mo" | "return1mo" | "rsi14" | "maCross"
  | "beta" | "vol60";

const METRIC_KEYS: MetricKey[] = [
  "pe", "pb", "ps", "evEbitda",
  "revenueGrowth", "epsGrowth", "fcfGrowth",
  "roe", "roa", "grossMargin", "operatingMargin", "netMargin", "fcfYield",
  "return12mo", "return3mo", "return1mo", "rsi14", "maCross",
  "beta", "vol60",
];

type Stats = { mean: number; std: number; n: number };
type SectorStats = Partial<Record<MetricKey, Stats>>;

type UniverseStatsFile = {
  generatedAt: string;
  universe: { size: number; criteria: string };
  metrics: Partial<Record<MetricKey, Stats>>;
  sectors: Record<string, { size: number; metrics: SectorStats }>;
};

type ScreenerRow = {
  symbol: string;
  companyName: string;
  marketCap: number;
  sector: string;
  industry: string;
  beta: number;
  price: number;
};

type TickerMetrics = Partial<Record<MetricKey, number>> & { sector: string };

async function fetchScreener(): Promise<ScreenerRow[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY not set in .env");
  const url = new URL("https://financialmodelingprep.com/stable/company-screener");
  url.searchParams.set("marketCapMoreThan", String(MIN_MARKET_CAP));
  url.searchParams.set("isActivelyTrading", "true");
  url.searchParams.set("country", "US");
  url.searchParams.set("exchange", "NASDAQ,NYSE");
  url.searchParams.set("limit", String(MAX_UNIVERSE_SIZE));
  url.searchParams.set("apikey", apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Screener failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as ScreenerRow[];
}

async function extractTickerMetrics(
  symbol: string,
  sector: string,
  betaFromScreener: number
): Promise<TickerMetrics | null> {
  try {
    // Skip /profile — screener already gave us sector + beta.
    const [quoteR, ratiosR, kmR, growthR, historyR] = await Promise.all([
      fmp.quote(symbol),
      fmp.ratiosTtm(symbol),
      fmp.keyMetricsTtm(symbol),
      fmp.financialGrowth(symbol).catch(() => [] as FinancialGrowth[]),
      fmp.historical(symbol).catch(() => [] as PricePoint[]),
    ]);

    const quote: Quote | undefined = quoteR[0];
    const ratios: RatiosTtm | undefined = ratiosR[0];
    const km: KeyMetricsTtm | undefined = kmR[0];
    const growth: FinancialGrowth | undefined = growthR[0];
    const history: PricePoint[] = historyR ?? [];

    const golden = maCrossover(quote?.priceAvg50 ?? null, quote?.priceAvg200 ?? null);

    const m: TickerMetrics = { sector };
    const set = (k: MetricKey, v: number | null | undefined) => {
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      m[k] = v;
    };

    set("pe", ratios?.priceToEarningsRatioTTM);
    set("pb", ratios?.priceToBookRatioTTM);
    set("ps", ratios?.priceToSalesRatioTTM);
    set("evEbitda", km?.evToEBITDATTM);
    set("revenueGrowth", growth?.revenueGrowth);
    set("epsGrowth", growth?.epsgrowth);
    set("fcfGrowth", growth?.freeCashFlowGrowth);
    set("roe", km?.returnOnEquityTTM);
    set("roa", km?.returnOnAssetsTTM);
    set("grossMargin", ratios?.grossProfitMarginTTM);
    set("operatingMargin", ratios?.operatingProfitMarginTTM);
    set("netMargin", ratios?.netProfitMarginTTM);
    set("fcfYield", km?.freeCashFlowYieldTTM);
    set("return12mo", return12mo(history));
    set("return3mo", return3mo(history));
    set("return1mo", return1mo(history));
    set("rsi14", rsi14(history));
    set("maCross", golden === null ? null : golden ? 1 : 0);
    set("beta", betaFromScreener);
    set("vol60", realizedVolatility(history));

    return m;
  } catch (err) {
    console.warn(`\n  ⚠ ${symbol}: ${(err as Error).message}`);
    return null;
  }
}

// Winsorize: clip to [p5, p95] before computing mean/std to limit outlier impact.
function winsorize(values: number[]): number[] {
  if (values.length < 20) return values; // not enough samples to clip meaningfully
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (q: number) => Math.floor(sorted.length * q);
  const lo = sorted[idx(0.05)];
  const hi = sorted[idx(0.95)];
  return values.map((v) => Math.max(lo, Math.min(hi, v)));
}

function computeStats(rawValues: number[]): Stats | null {
  if (rawValues.length < 5) return null;
  const w = winsorize(rawValues);
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  const variance = w.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, w.length - 1);
  const std = Math.sqrt(variance);
  return { mean, std, n: rawValues.length };
}

async function main() {
  console.log("Fetching universe screener...");
  const screener = await fetchScreener();
  const universe = screener
    .filter((r) => r.symbol && r.sector && r.marketCap >= MIN_MARKET_CAP)
    .slice(0, MAX_UNIVERSE_SIZE);
  console.log(`  → ${universe.length} tickers`);

  console.log(`Fetching metrics (concurrency=${CONCURRENCY})...`);
  const allMetrics: TickerMetrics[] = [];
  let done = 0;
  for (let i = 0; i < universe.length; i += CONCURRENCY) {
    const batch = universe.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((row) => extractTickerMetrics(row.symbol, row.sector, row.beta))
    );
    for (const r of results) if (r) allMetrics.push(r);
    done += batch.length;
    if (done % 25 === 0 || done === universe.length) {
      console.log(`  ${done}/${universe.length} (${allMetrics.length} ok)`);
    }
    if (i + CONCURRENCY < universe.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  console.log(`\n  → ${allMetrics.length} successful`);

  // Aggregate by sector + universe-wide
  const sectors = new Map<string, TickerMetrics[]>();
  for (const m of allMetrics) {
    if (!sectors.has(m.sector)) sectors.set(m.sector, []);
    sectors.get(m.sector)!.push(m);
  }

  const universeMetrics: Partial<Record<MetricKey, Stats>> = {};
  for (const k of METRIC_KEYS) {
    const values = allMetrics
      .map((m) => m[k])
      .filter((v): v is number => v !== undefined && Number.isFinite(v));
    const s = computeStats(values);
    if (s) universeMetrics[k] = s;
  }

  const sectorOut: UniverseStatsFile["sectors"] = {};
  for (const [sector, rows] of sectors) {
    const sm: SectorStats = {};
    for (const k of METRIC_KEYS) {
      const values = rows
        .map((r) => r[k])
        .filter((v): v is number => v !== undefined && Number.isFinite(v));
      const s = computeStats(values);
      if (s) sm[k] = s;
    }
    sectorOut[sector] = { size: rows.length, metrics: sm };
  }

  const out: UniverseStatsFile = {
    generatedAt: new Date().toISOString(),
    universe: {
      size: allMetrics.length,
      criteria: `marketCap > $${MIN_MARKET_CAP / 1e9}B (mid+large cap), US-listed (NASDAQ/NYSE), actively trading, capped at ${MAX_UNIVERSE_SIZE} names`,
    },
    metrics: universeMetrics,
    sectors: sectorOut,
  };

  const outPath = path.resolve(process.cwd(), "data", "universe-stats.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`Sectors: ${Object.keys(sectorOut).length}`);
  for (const [sector, info] of Object.entries(sectorOut)) {
    console.log(`  ${sector}: ${info.size} tickers`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
