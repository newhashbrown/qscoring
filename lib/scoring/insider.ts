/**
 * Insider net activity (Phase 5c positioning).
 *
 * Pure summary over /insider-trading rows: net open-market buying vs selling
 * over a trailing window. Only Form-4 open-market Purchases (P-) and Sales
 * (S-) are counted — awards, gifts, and option exercises are excluded as noise.
 *
 * (Short interest, days-to-cover, and institutional-ownership change are NOT
 * available on the current FMP plan, so the positioning block ships insider-only
 * — see the diagnosis in Phase 0.)
 */

import type { InsiderTrade } from "./fmp";

export type InsiderSummary = {
  windowDays: number;
  buyCount: number;
  sellCount: number;
  netShares: number; // + = net buying
  netValue: number; // signed USD
  direction: "net-buying" | "net-selling" | "neutral";
};

const DAY_MS = 86_400_000;

export function summarizeInsider(
  trades: readonly InsiderTrade[] | null | undefined,
  now: Date = new Date(),
  windowDays = 180
): InsiderSummary | null {
  if (!trades || trades.length === 0) return null;
  const cutoff = new Date(now.getTime() - windowDays * DAY_MS).toISOString().slice(0, 10);

  let buyCount = 0;
  let sellCount = 0;
  let netShares = 0;
  let netValue = 0;
  let considered = 0;

  for (const t of trades) {
    if (!t.transactionDate || t.transactionDate < cutoff) continue;
    const tt = (t.transactionType ?? "").toUpperCase();
    const isPurchase = tt.startsWith("P-");
    const isSale = tt.startsWith("S-");
    if (!isPurchase && !isSale) continue;

    const shares = Number.isFinite(t.securitiesTransacted) ? (t.securitiesTransacted as number) : 0;
    const price = Number.isFinite(t.price) ? (t.price as number) : 0;
    const sign = isPurchase ? 1 : -1;

    if (isPurchase) buyCount += 1;
    else sellCount += 1;
    netShares += sign * shares;
    netValue += sign * shares * price;
    considered += 1;
  }

  if (considered === 0) return null;
  const direction = netValue > 0 ? "net-buying" : netValue < 0 ? "net-selling" : "neutral";
  return { windowDays, buyCount, sellCount, netShares, netValue, direction };
}
