/**
 * Weekly forward-track recap analysis.
 *
 * Pairs a "start" snapshot with an "end" snapshot ~7 days later, then
 * computes per-ticker forward returns, signal hit rates, and aggregate
 * stats. The output of analyzeWeek() is written to data/recaps/[date].json
 * by scripts/build-weekly-recap.ts and rendered by /blog/recaps/[week].
 *
 * This is the "public accountability" engine — it pairs predictions
 * (signals from the start snapshot) with outcomes (forward returns to
 * the end snapshot) so anyone can see how the QScore signal performed
 * over the week. No look-ahead by construction: both snapshots are
 * locked-in JSON files in public source control.
 */

import type { ScoreboardPick } from "@/data/categories";
import type { Signal } from "@/lib/scoring";

export type SnapshotFile = {
  generatedAt: string;
  picks: ScoreboardPick[];
};

export type RecapRow = {
  ticker: string;
  companyName: string;
  startSignal: Signal;
  startComposite: number;
  endSignal: Signal;
  endComposite: number;
  startPrice: number;
  endPrice: number;
  /** Forward return as decimal — 0.012 = +1.2% */
  forwardReturn: number;
  /** Whether the start signal directionally agreed with the forward move. */
  signalCorrect: boolean | null;
  /** Did the signal flip during the week? */
  signalFlipped: boolean;
  /**
   * Set when a split between the snapshots re-based the price and the return
   * was corrected for it (issue #76) — startPrice/endPrice remain the frozen
   * ledger values, so renderers should badge the basis change.
   */
  basisAdjusted?: boolean;
};

export type SignalHitStats = {
  signal: Signal;
  count: number;
  correctCount: number;
  hitRate: number; // 0-1
  averageReturn: number;
};

export type WeeklyRecap = {
  /** Slug used for the URL — YYYY-MM-DD of the END snapshot date. */
  weekEnding: string;
  startSnapshotDate: string;
  endSnapshotDate: string;
  startGeneratedAt: string;
  endGeneratedAt: string;
  daysCovered: number;
  rowCount: number;
  rows: RecapRow[];
  /** Per-signal hit rate breakdown — were the model's calls directionally right? */
  hitStats: SignalHitStats[];
  /** Universe average composite at start vs end — gauge of overall market mood. */
  startUniverseAvg: number;
  endUniverseAvg: number;
  /** Top 5 forward returners. */
  bestMovers: RecapRow[];
  /** Bottom 5. */
  worstMovers: RecapRow[];
  /** Tickers whose signal changed between snapshots. */
  signalFlips: RecapRow[];
};

const SIGNAL_DIRECTION: Record<Signal, "long" | "short" | "neutral"> = {
  BUY_LONG_TERM: "long",
  BUY_SHORT_TERM: "long",
  HOLD: "neutral",
  SHORT: "short",
};

function isSignalCorrect(signal: Signal, forwardReturn: number): boolean | null {
  const dir = SIGNAL_DIRECTION[signal];
  if (dir === "neutral") return null; // Hold has no direction; can't be right or wrong
  if (dir === "long") return forwardReturn > 0;
  return forwardReturn < 0;
}

export function analyzeWeek(
  startSnap: SnapshotFile,
  startDate: string,
  endSnap: SnapshotFile,
  endDate: string,
  opts: {
    /**
     * Split-basis correction (issue #76): factor converting this ticker's
     * old-basis entry price to the end snapshot's basis. Defaults to 1.
     */
    splitFactor?: (ticker: string) => number;
  } = {}
): WeeklyRecap {
  // Index the end snapshot by ticker for O(1) lookup
  const endByTicker = new Map(endSnap.picks.map((p) => [p.ticker, p]));

  const rows: RecapRow[] = [];
  for (const startPick of startSnap.picks) {
    const endPick = endByTicker.get(startPick.ticker);
    if (!endPick) continue; // Ticker dropped from universe between snapshots
    if (!Number.isFinite(startPick.price) || startPick.price <= 0) continue;
    if (!Number.isFinite(endPick.price)) continue;

    const f = opts.splitFactor?.(startPick.ticker) ?? 1;
    const forwardReturn = (endPick.price * f - startPick.price) / startPick.price;
    rows.push({
      ticker: startPick.ticker,
      companyName: startPick.companyName,
      startSignal: startPick.signal,
      startComposite: startPick.composite,
      endSignal: endPick.signal,
      endComposite: endPick.composite,
      startPrice: startPick.price,
      endPrice: endPick.price,
      forwardReturn,
      signalCorrect: isSignalCorrect(startPick.signal, forwardReturn),
      signalFlipped: startPick.signal !== endPick.signal,
      ...(f !== 1 ? { basisAdjusted: true } : {}),
    });
  }

  // Per-signal hit rate aggregation. Hold rows are excluded since "Hold"
  // has no direction — a Hold-rated ticker that goes up isn't "correct"
  // any more than one that goes down.
  const directionalSignals: Signal[] = ["BUY_LONG_TERM", "BUY_SHORT_TERM", "SHORT"];
  const hitStats: SignalHitStats[] = directionalSignals.map((sig) => {
    const matching = rows.filter((r) => r.startSignal === sig);
    const correct = matching.filter((r) => r.signalCorrect === true).length;
    const avgReturn =
      matching.length > 0
        ? matching.reduce((s, r) => s + r.forwardReturn, 0) / matching.length
        : 0;
    return {
      signal: sig,
      count: matching.length,
      correctCount: correct,
      hitRate: matching.length > 0 ? correct / matching.length : 0,
      averageReturn: avgReturn,
    };
  });

  const sortedByReturn = [...rows].sort((a, b) => b.forwardReturn - a.forwardReturn);
  const bestMovers = sortedByReturn.slice(0, 5);
  const worstMovers = sortedByReturn.slice(-5).reverse();
  const signalFlips = rows.filter((r) => r.signalFlipped);

  const startAvg =
    startSnap.picks.reduce((s, p) => s + p.composite, 0) / Math.max(1, startSnap.picks.length);
  const endAvg =
    endSnap.picks.reduce((s, p) => s + p.composite, 0) / Math.max(1, endSnap.picks.length);

  // Days covered — calendar days between the two YYYY-MM-DD strings.
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
  const daysCovered = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));

  return {
    weekEnding: endDate,
    startSnapshotDate: startDate,
    endSnapshotDate: endDate,
    startGeneratedAt: startSnap.generatedAt,
    endGeneratedAt: endSnap.generatedAt,
    daysCovered,
    rowCount: rows.length,
    rows,
    hitStats,
    startUniverseAvg: startAvg,
    endUniverseAvg: endAvg,
    bestMovers,
    worstMovers,
    signalFlips,
  };
}
