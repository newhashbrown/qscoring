import type { PricePoint } from "./fmp";

/**
 * FMP returns price history newest-first. We sort defensively in case that
 * ever changes, so all helpers can assume index 0 = most recent.
 */
function newestFirst(history: PricePoint[]): PricePoint[] {
  return [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
}

const TRADING_DAYS = {
  ONE_MONTH: 21,
  THREE_MONTHS: 63,
  TWELVE_MONTHS: 252,
  RSI_PERIOD: 14,
  VOL_WINDOW: 60,
} as const;

export function periodReturn(history: PricePoint[], days: number): number | null {
  const sorted = newestFirst(history);
  if (sorted.length <= days) return null;
  const latest = sorted[0]?.price;
  const past = sorted[days]?.price;
  if (latest == null || past == null) return null;
  // A literal 0 on a real ticker is almost certainly an FMP data-quality
  // issue (delisted, halted with bogus row) — we still drop the metric, but
  // surface it in logs so operators can spot upstream data rot rather than
  // silently shrinking the per-ticker metric set.
  if (latest === 0 || past === 0) {
    console.warn(
      `periodReturn: zero price in history (latest=${latest}, past=${past}) for ${days}d window`
    );
    return null;
  }
  return (latest - past) / past;
}

export const return1mo = (h: PricePoint[]) => periodReturn(h, TRADING_DAYS.ONE_MONTH);
export const return3mo = (h: PricePoint[]) => periodReturn(h, TRADING_DAYS.THREE_MONTHS);
export const return12mo = (h: PricePoint[]) => periodReturn(h, TRADING_DAYS.TWELVE_MONTHS);

/**
 * RSI(14) — simple-average variant.
 *
 * Computes gains/losses across the most recent 14 day-to-day moves and divides
 * by the period. This is NOT Wilder's smoothed RSI (which seeds an initial
 * 14-period average and then applies an exponential update of weight 1/14).
 * The simple variant is more reactive at the edges and will diverge from the
 * RSI shown on TradingView, Bloomberg, or most brokerage charts by a few
 * points after extended trends.
 *
 * Documented here intentionally — keep this consistent with the methodology
 * page if you ever publish per-metric formulas.
 */
export function rsi14(history: PricePoint[]): number | null {
  const sorted = newestFirst(history);
  const period = TRADING_DAYS.RSI_PERIOD;
  if (sorted.length < period + 1) return null;
  // Take period+1 most recent closes, ordered oldest → newest for diff calc.
  const closes = sorted.slice(0, period + 1).map((p) => p.price).reverse();
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses += -d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Realized annualized volatility from log returns over the most recent N days.
 * Uses 252-trading-day annualization factor.
 */
export function realizedVolatility(history: PricePoint[], days = TRADING_DAYS.VOL_WINDOW): number | null {
  const sorted = newestFirst(history);
  if (sorted.length <= days) return null;
  const returns: number[] = [];
  for (let i = 0; i < days; i++) {
    const today = sorted[i].price;
    const prev = sorted[i + 1].price;
    if (!today || !prev) return null;
    returns.push(Math.log(today / prev));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * Returns true if 50-day SMA > 200-day SMA (golden cross / bullish trend).
 * Caller can pass quote.priceAvg50 / quote.priceAvg200 directly to avoid
 * recomputing from the price history when those are already returned by FMP.
 */
export function maCrossover(ma50: number | null, ma200: number | null): boolean | null {
  if (!ma50 || !ma200) return null;
  return ma50 > ma200;
}
