import { fetchTickerData, scoreFromFetched } from "./score";
import type { Signal } from "./types";

export type Mover = {
  ticker: string;
  companyName: string;
  sector: string | null;
  composite: number;
  yesterdayComposite: number;
  delta: number;
  signal: Signal;
  price: number;
  changePercent: number;
};

// Universe scanned for biggest 24-hour QScore swings. Larger names tend to
// have richer FMP coverage, fewer missing-data nulls, and more meaningful
// daily price moves to drive momentum-category deltas.
const MOVERS_UNIVERSE: readonly string[] = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "BRK-B",
  "JPM", "V", "MA", "UNH", "WMT", "JNJ", "PG", "HD", "BAC", "XOM",
  "PFE", "NFLX", "CRM", "ADBE", "ORCL", "AMD", "INTC", "QCOM", "AVGO",
  "DIS", "MCD", "KO", "COST", "PEP", "ABBV", "LLY", "TMO",
];

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

async function moverFor(ticker: string): Promise<Mover | null> {
  try {
    const data = await fetchTickerData(ticker);
    const today = scoreFromFetched(ticker, data, { historyOffset: 0 });
    const yesterday = scoreFromFetched(ticker, data, { historyOffset: 1 });
    const delta = today.composite - yesterday.composite;
    return {
      ticker: today.ticker,
      companyName: today.companyName,
      sector: today.sector,
      composite: today.composite,
      yesterdayComposite: yesterday.composite,
      delta,
      signal: today.signal,
      price: today.price,
      changePercent: today.changePercent,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the top-N tickers from MOVERS_UNIVERSE sorted by absolute QScore
 * change vs yesterday's snapshot. Today's snapshot uses the full price
 * history; yesterday's uses history shifted by one trading day. Fundamentals
 * are identical for both snapshots so the delta is driven by momentum and
 * (slightly) the realized-volatility component of risk.
 */
export async function computeMovers(top = 4): Promise<Mover[]> {
  const raw = await withConcurrency(MOVERS_UNIVERSE, CONCURRENCY, moverFor);
  const movers = raw.filter((m): m is Mover => m !== null && Number.isFinite(m.delta));
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return movers.slice(0, top);
}
