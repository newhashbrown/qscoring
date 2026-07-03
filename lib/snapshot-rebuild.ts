/**
 * Pure logic for the deliberate as-of rebuild of a lost snapshot day.
 *
 * The daily pre-market build freezes each ticker's SETTLED close for the
 * prior trading day via chooseLedgerPrice (lib/snapshot-price.ts). When a
 * run is lost (2026-06-26 to a GitHub cron delay, 2026-07-01 to a transient
 * screener 429), the runbook allows exactly one recovery: rebuild the day
 * from FMP historical EOD closes, as-of, with zero look-ahead. This module
 * is that rebuild's core, kept pure so it is unit-testable:
 *
 *   - price/changePercent come from the TARGET date's historical bar and the
 *     prior trading day's bar — bars after the target date are structurally
 *     invisible, so the ledger stays no-look-ahead even though the rebuild
 *     runs days later.
 *   - scores (composite, signals, categories, header) are carried forward
 *     from the last good snapshot BEFORE the target: one day stale, which is
 *     conservative, rather than rescored today, which would leak post-target
 *     information into a target-dated cohort.
 *
 * Driven by scripts/rebuild-snapshot-asof.ts.
 */

export type EodBar = { date: string; close: number };

export type AsOfLedger = { price: number; changePercent: number | null };

/**
 * The settled close for `targetDate` plus the % change vs the prior trading
 * day's bar, computed exactly like settledCloseFromHistory + chooseLedgerPrice
 * would have pre-market. Returns null when the target date has no bar (the
 * ticker was halted, delisted, or not yet listed — there is nothing honest to
 * freeze). changePercent is null when no prior bar exists.
 */
export function asOfLedgerPrice(
  bars: readonly EodBar[],
  targetDate: string
): AsOfLedger | null {
  // Everything after the target date is discarded FIRST — the whole point of
  // an as-of rebuild is that later bars cannot influence the frozen row.
  const clean = bars
    .filter(
      (b) =>
        typeof b.date === "string" &&
        Number.isFinite(b.close) &&
        b.close > 0 &&
        b.date <= targetDate
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const top = clean[0];
  if (!top || top.date !== targetDate) return null;

  const prev = clean.find((b) => b.date < targetDate);
  const changePercent =
    prev !== undefined ? ((top.close - prev.close) / prev.close) * 100 : null;
  return { price: top.close, changePercent };
}

export type RebuildMiss = {
  ticker: string;
  reason: "no-target-bar" | "no-prior-bar";
};

type LedgerPick = { ticker: string; price: number; changePercent: number };

/**
 * Rebuild a snapshot's picks: carry every field forward from the source
 * (last-good) snapshot, overriding ONLY price and changePercent with the
 * as-of ledger values. Tickers without an honest target-day bar are dropped
 * and reported — a missing row beats a fabricated one.
 */
export function rebuildSnapshotPicks<T extends LedgerPick>(
  sourcePicks: readonly T[],
  ledgerByTicker: ReadonlyMap<string, AsOfLedger>
): { picks: T[]; missing: RebuildMiss[] } {
  const picks: T[] = [];
  const missing: RebuildMiss[] = [];
  for (const p of sourcePicks) {
    const ledger = ledgerByTicker.get(p.ticker);
    if (!ledger) {
      missing.push({ ticker: p.ticker, reason: "no-target-bar" });
      continue;
    }
    if (ledger.changePercent === null) {
      missing.push({ ticker: p.ticker, reason: "no-prior-bar" });
      continue;
    }
    picks.push({ ...p, price: ledger.price, changePercent: ledger.changePercent });
  }
  picks.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return { picks, missing };
}
