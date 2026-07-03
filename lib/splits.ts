/**
 * Split-basis adjustment for the append-only snapshot ledger (issue #76).
 *
 * Snapshot rows freeze each ticker's price on the basis in effect THAT day.
 * When a stock later splits, every later price source is on the new basis, so
 * a cohort entered before the split joins an old-basis entry to a new-basis
 * exit and books a phantom return (CRWD 4:1 → phantom −74.7%). The ledger is
 * append-only — historical snapshots are never rewritten — so the correction
 * happens at JOIN time using this module and the committed data/splits.json
 * store (built by scripts/build-splits.ts from the FMP splits calendar).
 *
 * Two distinct date rules, both deliberate:
 *
 *  - `date` (LEDGER boundary): the first snapshot date whose frozen price is
 *    on the NEW basis. Detected from the ledger itself, because it can differ
 *    from FMP's effective date — e.g. the as-of rebuilt 2026-07-01 snapshot
 *    took prices from FMP *adjusted* history, so its basis flipped a session
 *    before FMP's official 07-02 split date. Used to adjust snapshot-to-
 *    snapshot joins: adjust the entry iff entryDate < date ≤ exitDate.
 *
 *  - `fmpDate` (FMP effective date): provenance — FMP's official date, which
 *    boundary detection in scripts/build-splits.ts anchors its search around.
 *
 * Every price fetched from FMP adjusted history is on the NEWEST basis, so
 * converting a fetched bar to the ledger's basis at its date (exit-price
 * store, build-exit-prices.ts) also keys off the ledger boundary — see
 * toLedgerBasisFactor.
 */
import fs from "node:fs";
import path from "node:path";

export type SplitEvent = {
  /** Ledger basis boundary — FIRST snapshot date on the NEW basis. */
  date: string;
  numerator: number;
  denominator: number;
  /** FMP's official effective date (bars before it are adjusted). */
  fmpDate?: string;
};

/** ticker → events, ascending by date. */
export type SplitStore = Record<string, SplitEvent[]>;

const SPLITS_FILE = () => path.resolve(process.cwd(), "data", "splits.json");

const ratioOf = (e: SplitEvent): number | null => {
  const r = e.numerator / e.denominator;
  return Number.isFinite(r) && r > 0 ? r : null;
};

/**
 * Factor converting an old-basis ENTRY price into the exit's basis:
 * honest return = (exitPrice * factor) / entryPrice − 1.
 * A split counts when its ledger boundary lies in (entryDate, exitDate] —
 * an entry ON the boundary already froze new-basis prices.
 */
export function splitFactor(
  events: readonly SplitEvent[],
  entryDate: string,
  exitDate: string
): number {
  let f = 1;
  for (const e of events) {
    const r = ratioOf(e);
    if (r === null) continue;
    if (entryDate < e.date && e.date <= exitDate) f *= r;
  }
  return f;
}

/**
 * Factor converting a freshly fetched FMP-adjusted close for bar date
 * `barDate` to the LEDGER's basis on that date. Every fetched bar is on the
 * newest basis (FMP divides bars before the effective date; later bars
 * already trade there), so the conversion multiplies by the ratio of every
 * split whose ledger boundary is after the bar — the same boundary that
 * defines which basis the snapshots froze.
 */
export function toLedgerBasisFactor(
  events: readonly SplitEvent[],
  barDate: string
): number {
  let f = 1;
  for (const e of events) {
    const r = ratioOf(e);
    if (r === null) continue;
    if (barDate < e.date) f *= r;
  }
  return f;
}

/** Store-level convenience: 1 for tickers with no recorded splits. */
export function splitFactorForStore(
  store: SplitStore,
  ticker: string,
  entryDate: string,
  exitDate: string
): number {
  const events = store[ticker];
  return events ? splitFactor(events, entryDate, exitDate) : 1;
}

/** Reads data/splits.json; missing or corrupt file → empty store. */
export function loadSplits(): SplitStore {
  try {
    const raw = fs.readFileSync(SPLITS_FILE(), "utf-8");
    const parsed = JSON.parse(raw) as SplitStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
