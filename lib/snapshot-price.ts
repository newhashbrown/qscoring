/**
 * Settled-close sourcing for the no-look-ahead snapshot ledger.
 *
 * Root-cause fix for the 2026-06-22 contamination: the snapshot's price and
 * changePercent came from FMP /quote (live intraday), faithful only because the
 * pre-market run happens while the market is closed. If the run slipped into the
 * session, live intraday prices were frozen under the prior-close label.
 *
 * Instead, derive the price from the settled end-of-day history bar and record
 * it ONLY when that bar's date equals the snapshot's labeled date. That makes
 * the ledger price correct by construction regardless of when the job runs:
 *   - pre-market: newest EOD bar == prior close == snapshot date  → settled
 *   - in-session: newest EOD bar is still the prior close == snapshot date,
 *     so the ledger records the settled close, NOT the live intraday print
 *   - after-close before the EOD bar publishes: newest bar is yesterday and
 *     does NOT match today's snapshot date → fall back to the live quote,
 *     which equals today's close while the market is shut
 *
 * This module is pure so the selection is unit-tested independently of FMP.
 */
import type { PricePoint } from "./scoring/fmp";

export interface SettledClose {
  /** Date (YYYY-MM-DD) of the newest settled EOD bar, or null if none. */
  date: string | null;
  /** Settled close for that date, or null. */
  close: number | null;
  /** Day return vs the prior settled bar (percent), or null. */
  changePercent: number | null;
}

/**
 * The newest settled EOD close from a newest-first history array (index 0 is
 * the latest bar — FMP /historical-price-eod/light ordering). changePercent is
 * the return vs the immediately-prior bar, null when it can't be computed.
 */
export function settledCloseFromHistory(history: readonly PricePoint[]): SettledClose {
  const top = history[0];
  if (!top || !Number.isFinite(top.price)) {
    return { date: null, close: null, changePercent: null };
  }
  const prior = history[1];
  const changePercent =
    prior && Number.isFinite(prior.price) && prior.price !== 0
      ? ((top.price - prior.price) / prior.price) * 100
      : null;
  return { date: top.date, close: top.price, changePercent };
}

export interface LedgerPriceArgs {
  /** The snapshot's labeled close date (marketCloseDate). */
  snapshotDate: string;
  settled: SettledClose;
  /** Live /quote price (current behavior) used as the fallback. */
  livePrice: number;
  liveChangePercent: number;
}

export interface LedgerPrice {
  price: number;
  changePercent: number;
  source: "settled" | "live";
}

/**
 * Choose the price/changePercent to freeze into the ledger for `snapshotDate`.
 * Prefers the settled EOD close when its date matches the snapshot date; else
 * falls back to the live quote (correct when the market is closed).
 */
export function chooseLedgerPrice(args: LedgerPriceArgs): LedgerPrice {
  const { snapshotDate, settled, livePrice, liveChangePercent } = args;
  if (settled.date === snapshotDate && settled.close != null && Number.isFinite(settled.close)) {
    return {
      price: settled.close,
      changePercent: settled.changePercent ?? liveChangePercent,
      source: "settled",
    };
  }
  return { price: livePrice, changePercent: liveChangePercent, source: "live" };
}
