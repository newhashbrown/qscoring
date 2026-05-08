import { fetchTickerData, scoreFromFetched } from "./score";
import type { CategoryName, Signal } from "./types";

export type StrongPick = {
  ticker: string;
  companyName: string;
  price: number;
  changePercent: number;
  composite: number;
  signal: Signal;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  categories: Array<{ name: CategoryName; label: string; score: number }>;
};

// Picks universe — wider than the 7-name carousel default but tight enough
// that a cold-cache scan stays well under FMP's 300 req/min ceiling. Overlap
// with MOVERS_UNIVERSE means the underlying FMP fetches are cache-shared with
// the homepage's TopMoversStrip, so adding this section is roughly free.
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

// Stocks below this composite score are filtered out — we want the carousel
// to showcase compelling picks, not Holds and Shorts. 65 corresponds to the
// Buy Short-Term threshold in the signal logic.
const MIN_COMPOSITE = 65;

const CONCURRENCY = 4;

async function withConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

async function pickFor(ticker: string): Promise<StrongPick | null> {
  try {
    const data = await fetchTickerData(ticker);
    const r = scoreFromFetched(ticker, data);
    return {
      ticker: r.ticker,
      companyName: r.companyName,
      price: r.price,
      changePercent: r.changePercent,
      composite: r.composite,
      signal: r.signal,
      confidence: r.confidence,
      categories: r.categories.map((c) => ({ name: c.name, label: c.label, score: c.score })),
    };
  } catch {
    return null;
  }
}

/**
 * Returns up to `limit` picks from PICKS_UNIVERSE filtered to composite ≥ 65
 * and sorted by composite descending. Tie-broken by ticker for stability so
 * the carousel order doesn't churn between renders when scores are close.
 */
export async function computeStrongPicks(limit = 12): Promise<StrongPick[]> {
  const raw = await withConcurrency(PICKS_UNIVERSE, CONCURRENCY, pickFor);
  const picks = raw.filter(
    (p): p is StrongPick => p !== null && Number.isFinite(p.composite) && p.composite >= MIN_COMPOSITE
  );
  picks.sort((a, b) => {
    if (b.composite !== a.composite) return b.composite - a.composite;
    return a.ticker.localeCompare(b.ticker);
  });
  return picks.slice(0, limit);
}
