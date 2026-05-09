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
  longTermScore: number;
  shortTermScore: number;
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

  const generatedAt = new Date().toISOString();

  const strongOutput = {
    generatedAt,
    universeSize: PICKS_UNIVERSE.length,
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
    universeSize: PICKS_UNIVERSE.length,
    picks: [...picks].sort((a, b) => a.ticker.localeCompare(b.ticker)),
  };

  const scoreboardPath = path.resolve(process.cwd(), "data", "scoreboard.json");
  fs.writeFileSync(scoreboardPath, JSON.stringify(scoreboardOutput, null, 2) + "\n");
  console.log(`Wrote ${picks.length} scoreboard rows → ${scoreboardPath}`);

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
  const snapshotDate = computeMarketCloseDate(generatedAt);
  const snapshotsDir = path.resolve(process.cwd(), "data", "snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  const snapshotPath = path.resolve(snapshotsDir, `${snapshotDate}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(scoreboardOutput, null, 2) + "\n");
  console.log(`Wrote snapshot → ${snapshotPath}`);
}

// Inline copy of lib/market-date.ts's marketCloseDate — duplicated rather
// than imported so this script has zero dependencies on the Next runtime
// and runs fine under plain `tsx` in CI.
function computeMarketCloseDate(generatedAtIso: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(generatedAtIso)).reduce(
    (acc, p) => {
      acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>
  );
  const etYear = parseInt(parts.year, 10);
  const etMonth = parseInt(parts.month, 10);
  const etDay = parseInt(parts.day, 10);
  const etHour = parseInt(parts.hour, 10);
  const target = new Date(Date.UTC(etYear, etMonth - 1, etDay));
  if (etHour < 16) target.setUTCDate(target.getUTCDate() - 1);
  while (target.getUTCDay() === 6 || target.getUTCDay() === 0) {
    target.setUTCDate(target.getUTCDate() - 1);
  }
  return target.toISOString().split("T")[0];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
