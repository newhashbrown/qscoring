/**
 * Forward-return Information Coefficient (IC) and quintile spreads.
 *
 * This is the live validation engine behind /performance. It reads the
 * append-only daily snapshots (data/snapshots/*.json) — each of which froze the
 * EOD price AND the model scores for ~800 names on a given session — and joins
 * an earlier snapshot's *scores* to a later snapshot's *prices* to measure how
 * well the score ranked subsequent returns. Because both legs come from
 * snapshots captured at the time, there is no look-ahead bias by construction
 * and the computation needs no live price fetch.
 *
 * Method notes / known limitations (surfaced honestly on the page):
 *   - IC is the cross-sectional Spearman rank correlation of score vs forward
 *     return, computed per start-snapshot ("cohort") and averaged. Rank-based,
 *     so robust to return outliers (splits, dividends).
 *   - Quintile spread (top-score minus bottom-score mean return) uses the MEAN,
 *     so it IS sensitive to outliers. Forward returns are therefore winsorized
 *     to [WINSOR_LO, WINSOR_HI] for the spread to neutralize split-driven fake
 *     prints. Dividends (a small effect at these horizons) are not adjusted.
 *   - Cohorts overlap heavily while data is thin; `independentWindows` reports
 *     how many non-overlapping horizons actually fit, and `preliminary` is set
 *     when fewer than two do, so the page never implies false significance.
 *   - Inner-joining on ticker drops names present at the start but gone by the
 *     end (delisted / removed from universe), which biases IC slightly upward
 *     (survivorship). Minor at monthly horizons; noted for completeness.
 */

import fs from "node:fs";
import { spearman } from "@/lib/scoring/rank-correlation";
import {
  HORIZONS,
  listSnapshotDates,
  loadSnapshot,
  tradingDaysBetween,
} from "@/lib/performance";

export type ScoreKey = "composite" | "longTermScore" | "shortTermScore";

// Winsorization bounds for the quintile-spread means. A legitimate move over a
// 1-month horizon almost never exceeds these; corporate-action artifacts
// (splits) do, so we clip them out of the mean.
const WINSOR_LO = -0.5;
const WINSOR_HI = 1.0;

// Minimum joined names for a cohort to count. This is a CORRECTNESS gate, not a
// nicety. The snapshot universe went through two unstable regimes before
// settling, and an IC computed across either is biased:
//   1. A ~66-name curated "strong picks" list (through ~2026-05-22) — a
//      pre-selected high-scorer subset with a restricted score range.
//   2. A ~800-name universe contaminated by ~400 mutual funds/ETFs (through
//      2026-06-11), whose scores were distorted (e.g. sector percentiles) by
//      the non-stock members; the first fully clean stock universe is
//      2026-06-12.
// Both regimes are caught by the same join-size floor: any cohort that touches a
// non-clean snapshot intersects a clean snapshot at only ~370 names, whereas two
// clean ~800-name snapshots intersect at ~790. 600 sits squarely in that gap
// (~220 margin below the contaminated band, ~190 above the clean band), so only
// genuine full-universe cross-sections are ever reported.
export const MIN_COHORT_N = 600;

const QUINTILES = 5;

type PickLike = { ticker: string; price: number } & Record<ScoreKey, number>;
type SnapLike = { date: string; picks: readonly PickLike[] };

export type CohortStats = {
  startDate: string;
  endDate: string;
  /** Names present in both snapshots. */
  n: number;
  /** Spearman rank IC of score vs forward return (raw returns). */
  ic: number;
  /** Winsorized mean forward return per score quintile; [0] = top scores. */
  quintileReturns: number[];
  /** quintileReturns[0] − quintileReturns[last]. */
  spread: number;
};

export type HorizonResult = {
  label: string;
  days: number;
  available: boolean;
  cohortCount: number;
  /** Non-overlapping horizon-length windows that fit in the elapsed history. */
  independentWindows: number;
  /** True when fewer than two independent windows exist (low significance). */
  preliminary: boolean;
  meanIC: number | null;
  meanSpread: number | null;
  /** The most recent cohort, for surfacing a concrete latest reading. */
  latestCohort: CohortStats | null;
};

const clip = (x: number) => Math.min(WINSOR_HI, Math.max(WINSOR_LO, x));
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;

/** Mean of each of `k` contiguous near-equal buckets over an ordered array. */
function bucketMeans(values: number[], k: number): number[] {
  const out: number[] = [];
  const n = values.length;
  for (let q = 0; q < k; q++) {
    const lo = Math.floor((q * n) / k);
    const hi = Math.floor(((q + 1) * n) / k);
    out.push(mean(values.slice(lo, hi)));
  }
  return out;
}

/**
 * Cross-sectional IC + quintile spread for one (start → end) snapshot pair.
 * Returns null when too few names join or the IC is undefined.
 */
export function cohortStats(
  start: SnapLike,
  end: SnapLike,
  scoreKey: ScoreKey,
  opts: { minN?: number } = {}
): CohortStats | null {
  const minN = opts.minN ?? MIN_COHORT_N;
  const endPrice = new Map<string, number>();
  for (const p of end.picks) endPrice.set(p.ticker, p.price);

  const joined: Array<{ score: number; ret: number }> = [];
  for (const p of start.picks) {
    const ep = endPrice.get(p.ticker);
    if (ep === undefined) continue; // survivorship: dropped names excluded
    if (!(p.price > 0) || !Number.isFinite(ep)) continue;
    const score = p[scoreKey];
    if (!Number.isFinite(score)) continue;
    joined.push({ score, ret: ep / p.price - 1 });
  }

  if (joined.length < minN) return null;

  const ic = spearman(
    joined.map((j) => j.score),
    joined.map((j) => j.ret)
  );
  if (!Number.isFinite(ic)) return null;

  // Quintiles by score, highest first; winsorized mean return per bucket.
  const byScoreDesc = [...joined].sort((a, b) => b.score - a.score);
  const quintileReturns = bucketMeans(
    byScoreDesc.map((j) => clip(j.ret)),
    QUINTILES
  );
  const spread = quintileReturns[0] - quintileReturns[quintileReturns.length - 1];

  return { startDate: start.date, endDate: end.date, n: joined.length, ic, quintileReturns, spread };
}

/** First snapshot at/after `startDate` that is ≥ `horizonDays` trading days out. */
function forwardPartner(
  startDate: string,
  startIdx: number,
  dates: string[],
  horizonDays: number
): string | null {
  for (let j = startIdx + 1; j < dates.length; j++) {
    if (tradingDaysBetween(startDate, dates[j]) >= horizonDays) return dates[j];
  }
  return null;
}

/**
 * Compute per-horizon IC/quintile results. Pure: takes the snapshot date list,
 * a loader, and "today" so it can be unit-tested with synthetic data and reused
 * by the disk-backed wrapper below.
 */
export function computeHorizonResults(
  dates: string[],
  load: (date: string) => SnapLike | null,
  today: string,
  scoreKey: ScoreKey = "composite"
): HorizonResult[] {
  return HORIZONS.map((h) => {
    const cohorts: CohortStats[] = [];
    for (let i = 0; i < dates.length; i++) {
      const endDate = forwardPartner(dates[i], i, dates, h.days);
      if (!endDate) continue;
      const start = load(dates[i]);
      const end = load(endDate);
      if (!start || !end) continue;
      const cs = cohortStats(start, end, scoreKey);
      if (cs) cohorts.push(cs);
    }

    const available = cohorts.length > 0;
    // Anchor significance to the first usable (full-universe) cohort, so a long
    // tail of excluded small-universe snapshots doesn't inflate the window count.
    const elapsed = available
      ? tradingDaysBetween(cohorts[0].startDate, today)
      : 0;
    const independentWindows = Math.floor(elapsed / h.days);

    return {
      label: h.label,
      days: h.days,
      available,
      cohortCount: cohorts.length,
      independentWindows,
      preliminary: available && independentWindows < 2,
      meanIC: available ? mean(cohorts.map((c) => c.ic)) : null,
      meanSpread: available ? mean(cohorts.map((c) => c.spread)) : null,
      latestCohort: cohorts.length ? cohorts[cohorts.length - 1] : null,
    };
  });
}

/** Disk-backed entry point used by /performance (build-time / static). */
export function summarizeForwardReturns(
  scoreKey: ScoreKey = "composite"
): HorizonResult[] {
  const dates = listSnapshotDates();
  const today = new Date().toISOString().split("T")[0];
  return computeHorizonResults(
    dates,
    (date) => loadSnapshot(date) as SnapLike | null,
    today,
    scoreKey
  );
}
