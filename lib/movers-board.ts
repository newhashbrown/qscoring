/**
 * Movers vs. Fundamentals — reconciliation logic (PHASE 1).
 *
 * Pure functions only: no I/O, no DB, no FMP, no filesystem. Given a day's
 * scored picks and the LATEST snapshot strictly before that day, classify
 * each mover by whether its price move agrees with what the model already
 * thought — as of the prior snapshot (anti-lookahead).
 *
 * This is a DIFFERENT feature from lib/scoring/movers.ts (QScore-swing
 * movers on the homepage) — do not conflate the two.
 */

import type { ScoreboardPick } from "@/data/categories";
import type { CategoryName, Signal } from "@/lib/scoring/types";

// A committed snapshot: the date it represents plus its scored picks. Mirrors
// data/snapshots/<date>.json (the `picks` array), with the date carried
// alongside so reconcile can record which prior score it used (score_date)
// and enforce the anti-lookahead ordering.
export type DatedSnapshot = {
  date: string; // YYYY-MM-DD, US market close (ET)
  picks: ScoreboardPick[];
};

// The model's prior read of the stock, derived from the prior snapshot.
export type Stance = "bullish" | "bearish" | "neutral";

// Six reconciliation outcomes (direction × stance). "unscored_*" also covers
// the no-prior-score-on-record case (a strictly weaker form of "no actionable
// read" than a scored-but-neutral stance — distinguishable via null fields).
export type Alignment =
  | "confirmed_strength" // up + bullish
  | "unsupported_pop" //    up + bearish    (divergence)
  | "unscored_pop" //       up + neutral / no prior score
  | "confirmed_weakness" // down + bearish
  | "dislocation" //        down + bullish  (divergence)
  | "unscored_drop"; //     down + neutral / no prior score

export type FactorScores = {
  value: number | null;
  growth: number | null;
  momentum: number | null;
  profitability: number | null;
  risk: number | null;
};

export type MoverRow = {
  ticker: string;
  companyName: string;
  sector: string | null;
  dayReturnPct: number; // today's change_percent, verbatim (never recomputed)
  close: number; // today's price
  prevClose: number | null; // prior snapshot's price (null if no prior pick)
  // The model's view AS OF the prior snapshot. All null when this ticker has
  // no score on record strictly before today.
  priorComposite: number | null;
  priorSignal: Signal | null;
  factors: FactorScores;
  scoreDate: string | null; // date of the prior snapshot actually used
  stance: Stance | null; // null when no prior score on record
  alignment: Alignment;
  alignmentNote: string;
  // Liquidity — populated only by the live daily step (PHASE 4). Absent/null in
  // the historical backfill, whose snapshots carry no volume.
  volume?: number | null;
  dollarVolume?: number | null;
};

const NO_FACTORS: FactorScores = {
  value: null,
  growth: null,
  momentum: null,
  profitability: null,
  risk: null,
};

/**
 * Model stance from the PRIOR score. Signal takes precedence over composite:
 * a Buy/Short signal is decisive; only HOLD falls through to the composite
 * thresholds (>=65 bullish, <=35 bearish, else neutral).
 */
export function stanceOf(signal: Signal, composite: number): Stance {
  if (signal === "SHORT") return "bearish";
  if (signal === "BUY_LONG_TERM" || signal === "BUY_SHORT_TERM") return "bullish";
  // HOLD → decide on composite.
  if (composite >= 65) return "bullish";
  if (composite <= 35) return "bearish";
  return "neutral";
}

function factorsFrom(pick: ScoreboardPick): FactorScores {
  const byName = new Map<CategoryName, number>(
    pick.categories.map((c) => [c.name, c.score])
  );
  return {
    value: byName.get("value") ?? null,
    growth: byName.get("growth") ?? null,
    momentum: byName.get("momentum") ?? null,
    profitability: byName.get("profitability") ?? null,
    risk: byName.get("risk") ?? null,
  };
}

// Direction from today's move. Zero is treated as up (non-negative); in
// practice movers are ranked by change_percent so a flat 0% never surfaces.
function isUp(dayReturnPct: number): boolean {
  return dayReturnPct >= 0;
}

function alignmentFor(up: boolean, stance: Stance | null): Alignment {
  if (stance === "bullish") return up ? "confirmed_strength" : "dislocation";
  if (stance === "bearish") return up ? "unsupported_pop" : "confirmed_weakness";
  // neutral OR no prior score → "unscored".
  return up ? "unscored_pop" : "unscored_drop";
}

function fmtPct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : ""}${r}%`;
}

// Short, human alignment note. Analysis/education framing only — describes the
// model's prior read in bullish/bearish/strong/weak terms, never a buy/sell CTA.
function noteFor(
  alignment: Alignment,
  dir: string,
  scoreDate: string | null,
  composite: number | null,
  dayReturnPct: number
): string {
  const move = `${dir} ${fmtPct(dayReturnPct)} today`;
  const asOf = scoreDate ? ` as of ${scoreDate}` : "";
  const comp = composite === null ? "" : ` (composite ${Math.round(composite)})`;
  switch (alignment) {
    case "confirmed_strength":
      return `${move}, in line with the model's strong prior read${comp}${asOf}.`;
    case "confirmed_weakness":
      return `${move}, in line with the model's weak prior read${comp}${asOf}.`;
    case "unsupported_pop":
      return `${move} despite a bearish prior read${comp}${asOf} — a divergence.`;
    case "dislocation":
      return `${move} despite a bullish prior read${comp}${asOf} — a divergence.`;
    case "unscored_pop":
    case "unscored_drop":
      return scoreDate
        ? `${move} with no strong prior read${comp}${asOf}.`
        : `${move}; no prior-day score on record to compare against.`;
  }
}

/**
 * Reconcile a day's picks against the latest snapshot STRICTLY BEFORE that day.
 *
 * Purity contract: this trusts the caller to pass the correct prior snapshot;
 * the only ordering it enforces itself is the anti-lookahead guard below. Pass
 * `prior = null` for the earliest snapshot (no prior on record). Per-ticker
 * misses (ticker absent from an otherwise-present prior snapshot) are handled
 * the same as a null prior: null model fields + "unscored" alignment.
 *
 * Picks with a non-finite change_percent or price are dropped.
 */
export function reconcile(today: DatedSnapshot, prior: DatedSnapshot | null): MoverRow[] {
  if (prior && prior.date >= today.date) {
    // Anti-lookahead violation — the prior score must predate the move.
    throw new Error(
      `reconcile: prior snapshot ${prior.date} is not strictly before ${today.date}`
    );
  }

  const priorByTicker = new Map<string, ScoreboardPick>(
    (prior?.picks ?? []).map((p) => [p.ticker, p])
  );

  const rows: MoverRow[] = [];
  for (const pick of today.picks) {
    if (!Number.isFinite(pick.changePercent) || !Number.isFinite(pick.price)) continue;

    const dayReturnPct = pick.changePercent;
    const up = isUp(dayReturnPct);
    const dir = up ? "Up" : "Down";
    const priorPick = priorByTicker.get(pick.ticker) ?? null;

    if (!priorPick) {
      const alignment = alignmentFor(up, null);
      rows.push({
        ticker: pick.ticker,
        companyName: pick.companyName,
        sector: pick.sector ?? null,
        dayReturnPct,
        close: pick.price,
        prevClose: null,
        priorComposite: null,
        priorSignal: null,
        factors: NO_FACTORS,
        scoreDate: null,
        stance: null,
        alignment,
        alignmentNote: noteFor(alignment, dir, null, null, dayReturnPct),
      });
      continue;
    }

    const stance = stanceOf(priorPick.signal, priorPick.composite);
    const alignment = alignmentFor(up, stance);
    rows.push({
      ticker: pick.ticker,
      companyName: pick.companyName,
      sector: pick.sector ?? null,
      dayReturnPct,
      close: pick.price,
      prevClose: Number.isFinite(priorPick.price) ? priorPick.price : null,
      priorComposite: priorPick.composite,
      priorSignal: priorPick.signal,
      factors: factorsFrom(priorPick),
      scoreDate: prior!.date,
      stance,
      alignment,
      alignmentNote: noteFor(alignment, dir, prior!.date, priorPick.composite, dayReturnPct),
    });
  }

  return rows;
}

// Divergence cases — the differentiator: a pop the model rated bearish, or a
// drop it rated bullish. Used by the UI's "Show only divergences" toggle.
export function isDivergence(alignment: Alignment): boolean {
  return alignment === "unsupported_pop" || alignment === "dislocation";
}

// Shape of data/movers/<date>.json (and latest.json) — the artifact the
// backfill/daily steps write and the /movers UI reads. Deterministic: no
// wall-clock field (generatedAt is copied from the source snapshot).
export type MoversFile = {
  date: string; // the move day (T)
  scoreDate: string; // prior snapshot used for the model read (strictly < T)
  universeSize: number; // size of the scored universe that day (pre-floor)
  priceFloor: number;
  generatedAt: string;
  // Live daily step only. dollarVolumeApplied is false when volume couldn't be
  // fetched (e.g. FMP outage) and the step fell back to the price floor alone.
  dollarVolumeFloor?: number;
  dollarVolumeApplied?: boolean;
  gainers: MoverRow[];
  losers: MoverRow[];
};
