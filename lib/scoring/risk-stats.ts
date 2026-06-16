/**
 * Deeper risk statistics (Phase 5c): max drawdown, downside deviation, and
 * correlation to the S&P 500 — computed from the same price history the page
 * already fetches (no new fundamentals). Pure functions; the component fetches.
 *
 * FMP price history is newest-first; helpers reorder to chronological.
 */

import type { PricePoint } from "./fmp";

const TRADING_DAYS = 252;

function chronologicalPrices(history: readonly PricePoint[]): number[] {
  return [...history]
    .reverse()
    .map((p) => p.price)
    .filter((p) => Number.isFinite(p) && p > 0);
}

function dailyReturns(prices: readonly number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) r.push(prices[i] / prices[i - 1] - 1);
  }
  return r;
}

/** Worst peak-to-trough decline over the last `days` bars, as a positive fraction. */
export function maxDrawdown(
  history: readonly PricePoint[] | null | undefined,
  days = TRADING_DAYS
): number | null {
  const prices = chronologicalPrices((history ?? []).slice(0, days));
  if (prices.length < 2) return null;
  let peak = prices[0];
  let maxDD = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    if (peak > 0) {
      const dd = (peak - p) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

/** Annualized downside deviation (volatility of returns below `mar`, default 0). */
export function downsideDeviation(
  history: readonly PricePoint[] | null | undefined,
  days = TRADING_DAYS,
  mar = 0
): number | null {
  const prices = chronologicalPrices((history ?? []).slice(0, days));
  if (prices.length < 3) return null;
  const rets = dailyReturns(prices);
  if (rets.length === 0) return null;
  // Lower partial moment: sum squared shortfalls over the FULL period count.
  const shortfall = rets.reduce((s, r) => s + (r < mar ? (r - mar) ** 2 : 0), 0);
  return Math.sqrt(shortfall / rets.length) * Math.sqrt(TRADING_DAYS);
}

function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 5) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/**
 * Pearson correlation of daily returns between a stock and a benchmark
 * (e.g. ^GSPC), over the last `days` shared trading dates.
 */
export function returnsCorrelation(
  stock: readonly PricePoint[] | null | undefined,
  benchmark: readonly PricePoint[] | null | undefined,
  days = TRADING_DAYS
): number | null {
  if (!stock || !benchmark) return null;
  const benchByDate = new Map<string, number>();
  for (const p of benchmark) {
    if (Number.isFinite(p.price) && p.price > 0) benchByDate.set(p.date, p.price);
  }
  // Chronological shared dates, most recent `days`.
  const shared = [...stock]
    .reverse()
    .filter((p) => Number.isFinite(p.price) && p.price > 0 && benchByDate.has(p.date))
    .slice(-days);
  if (shared.length < 10) return null;

  const stockReturns = dailyReturns(shared.map((p) => p.price));
  const benchReturns = dailyReturns(shared.map((p) => benchByDate.get(p.date) as number));
  return pearson(stockReturns, benchReturns);
}
