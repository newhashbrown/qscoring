/**
 * Terminal values for hard delistings — issue #60 Phase B.
 *
 * Phase A (data/exit-prices.json) covers names that LEFT THE UNIVERSE but
 * kept trading: their real close on each cohort end date. This module covers
 * the names whose price history STOPS — acquisitions (shares halt at ~the
 * deal price) and bankruptcies (last trades near zero). For those,
 * data/terminal-values.json records the last available settled close, and the
 * forward-return engine carries it forward to every later cohort end date so
 * the name is measured at its real terminal return instead of being
 * survivorship-dropped.
 *
 * Guarantees (enforced by scripts/build-exit-prices.ts, which builds the
 * store):
 *   - A terminal is recorded ONLY when the ticker's FMP history has no bars
 *     on or after the needed end date AND the company profile confirms
 *     isActivelyTrading === false. A transient data gap never fabricates a
 *     terminal.
 *   - `close` is stored on the LEDGER's basis at lastBarDate (lib/splits
 *     toLedgerBasisFactor). Delisted names can't split afterwards, so that
 *     basis is also the basis of every later end date.
 *   - No look-ahead: a terminal only applies to end dates ≥ lastBarDate.
 */
import fs from "node:fs";
import path from "node:path";

export type TerminalValue = {
  /** Date of the last bar FMP has — the day the terminal price was struck. */
  lastBarDate: string;
  /** Last settled close, on the ledger's basis at lastBarDate. */
  close: number;
};

/** ticker → terminal value. */
export type TerminalStore = Record<string, TerminalValue>;

const TERMINALS_FILE = () => path.resolve(process.cwd(), "data", "terminal-values.json");

/** Reads data/terminal-values.json; missing or corrupt file → empty store. */
export function loadTerminalValues(): TerminalStore {
  try {
    const raw = fs.readFileSync(TERMINALS_FILE(), "utf-8");
    const parsed = JSON.parse(raw) as TerminalStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The exit-price map for one cohort end date, extended with every terminal
 * value that applies (lastBarDate ≤ endDate). A real exit-price row — an
 * actual bar ON the end date — always wins over a carried-forward terminal.
 */
export function exitPricesWithTerminals(
  exitPrices: ReadonlyMap<string, number>,
  terminals: TerminalStore,
  endDate: string
): ReadonlyMap<string, number> {
  const applicable = Object.entries(terminals).filter(
    ([, t]) => t.lastBarDate <= endDate && Number.isFinite(t.close) && t.close >= 0
  );
  if (applicable.length === 0) return exitPrices;
  const merged = new Map<string, number>();
  for (const [ticker, t] of applicable) merged.set(ticker, t.close);
  for (const [ticker, price] of exitPrices) merged.set(ticker, price);
  return merged;
}
