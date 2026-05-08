/**
 * Builds data/strong-picks.json — the homepage carousel's preranked list
 * of high-composite tickers. Hits the deployed /api/score endpoint rather
 * than calling FMP directly, so it uses the production cache layer and
 * doesn't need FMP_API_KEY locally.
 *
 * Designed to run from a daily GitHub Action (writes the file, commits if
 * changed). Can also be run locally:  npm run strong-picks
 */
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = process.env.QSCORING_BASE ?? "https://qscoring.com";

// Pacing for the cold-cache worst case: every ticker fans out to ~6 FMP
// calls inside /api/score. At 1 call/2s = 0.5 req/s, the upstream FMP load
// stays under ~3/s = 180/min, well below FMP's 300/min ceiling.
const REQUEST_GAP_MS = 2000;
const REQUEST_TIMEOUT_MS = 25_000;
const RETRY_BACKOFF_MS = [15_000, 30_000];

// No hard composite threshold — the carousel shows the relative top of the
// universe so it stays populated even in choppy regimes when no names clear
// classic "buy" territory. The ranking itself communicates strength.
const LIMIT = 12;

// Wider than MOVERS_UNIVERSE so the homepage doesn't feel like the same
// 7-name rotation. Sectors are deliberately mixed so on a tech-heavy day
// healthcare or energy names can still rise into the top picks.
const PICKS_UNIVERSE: readonly string[] = [
  // Core mega-caps
  "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "BRK-B", "AVGO", "LLY",
  // Financials & payments
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "BLK", "SPGI",
  // Healthcare
  "UNH", "JNJ", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "ISRG", "AMGN",
  // Consumer
  "WMT", "COST", "HD", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "TGT",
  // Tech / software
  "ORCL", "CRM", "ADBE", "AMD", "QCOM", "TXN", "INTU", "NOW", "PANW", "CRWD",
  // Energy & industrials
  "XOM", "CVX", "CAT", "GE", "BA", "HON", "RTX", "UNP", "DE", "LMT",
  // Media & comms
  "NFLX", "DIS", "T", "VZ", "TMUS", "CMCSA",
];

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
  price: number;
  changePercent: number;
  composite: number;
  signal: Signal;
  confidence: Confidence;
  categories: ApiCategory[];
  error?: string;
};

type Pick = {
  ticker: string;
  companyName: string;
  price: number;
  changePercent: number;
  composite: number;
  signal: Signal;
  confidence: Confidence;
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
      price: data.price,
      changePercent: data.changePercent,
      composite: Math.round(data.composite),
      signal: data.signal,
      confidence: data.confidence,
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
  console.log(`Scanning ${PICKS_UNIVERSE.length} tickers via ${BASE}…`);
  const picks: Pick[] = [];
  for (const ticker of PICKS_UNIVERSE) {
    const result = await fetchScore(ticker);
    if (result) picks.push(result);
    await sleep(REQUEST_GAP_MS);
  }

  const strong = picks
    .sort((a, b) => b.composite - a.composite || a.ticker.localeCompare(b.ticker))
    .slice(0, LIMIT);

  console.log(
    `Scored ${picks.length}/${PICKS_UNIVERSE.length} — top ${strong.length} composite range ${
      strong.at(-1)?.composite ?? 0
    }–${strong[0]?.composite ?? 0}`
  );

  const output = {
    generatedAt: new Date().toISOString(),
    universeSize: PICKS_UNIVERSE.length,
    picks: strong,
  };

  const outPath = path.resolve(process.cwd(), "data", "strong-picks.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${strong.length} picks → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
