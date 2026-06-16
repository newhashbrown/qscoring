/**
 * Analyst & earnings signals (Phase 5a).
 *
 * Pure derivations over already-fetched FMP payloads:
 *   - consensus rating mix (/grades-consensus)
 *   - rating-revision trend (/grades-historical — are analysts upgrading?)
 *   - earnings-surprise history (/earnings — beat/miss vs estimate)
 *
 * No I/O here so each is unit-testable; the component does the fetching.
 */

import type { EarningsRow, GradeConsensus, GradeHistoryRow, PriceTargetSummary } from "./fmp";

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function finite(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
}

export type ConsensusSummary = {
  total: number;
  buyCount: number; // strongBuy + buy
  holdCount: number;
  sellCount: number; // sell + strongSell
  bullishPct: number | null; // buyCount / total, 0–1
  label: string | null; // FMP consensus label
};

export function summarizeConsensus(c: GradeConsensus | null | undefined): ConsensusSummary | null {
  if (!c) return null;
  const buyCount = num(c.strongBuy) + num(c.buy);
  const holdCount = num(c.hold);
  const sellCount = num(c.sell) + num(c.strongSell);
  const total = buyCount + holdCount + sellCount;
  if (total === 0) return null;
  return {
    total,
    buyCount,
    holdCount,
    sellCount,
    bullishPct: buyCount / total,
    label: (c.consensus && c.consensus.trim()) || null,
  };
}

export type RevisionTrend = {
  months: number;
  bullishShareNow: number | null; // 0–1
  bullishSharePrior: number | null;
  shiftPoints: number | null; // (now − prior) × 100, percentage points
  direction: "upgrading" | "downgrading" | "stable";
  fromDate: string | null;
  toDate: string | null;
};

// Stable threshold: a swing under this many percentage points is noise, not a
// genuine re-rating.
const REVISION_STABLE_BAND = 2;

function bullishShare(r: GradeHistoryRow): number | null {
  const bull = num(r.analystRatingsStrongBuy) + num(r.analystRatingsBuy);
  const total =
    bull + num(r.analystRatingsHold) + num(r.analystRatingsSell) + num(r.analystRatingsStrongSell);
  return total > 0 ? bull / total : null;
}

export function ratingRevisionTrend(
  history: readonly GradeHistoryRow[] | null | undefined,
  months = 3
): RevisionTrend | null {
  if (!history || history.length < 2) return null;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date)); // newest first
  const latest = sorted[0];
  const prior = sorted[Math.min(sorted.length - 1, months)]; // ~`months` monthly snapshots back

  const now = bullishShare(latest);
  const pri = bullishShare(prior);
  if (now === null || pri === null) return null;

  const shiftPoints = (now - pri) * 100;
  const direction =
    shiftPoints > REVISION_STABLE_BAND
      ? "upgrading"
      : shiftPoints < -REVISION_STABLE_BAND
        ? "downgrading"
        : "stable";

  return {
    months,
    bullishShareNow: now,
    bullishSharePrior: pri,
    shiftPoints,
    direction,
    fromDate: prior.date,
    toDate: latest.date,
  };
}

// Estimate-revision signal: how the rolling-average analyst PRICE TARGET has
// moved last month vs last quarter. (FMP's plan exposes no EPS-estimate-
// revision feed; price targets are analyst estimates of fair value, so target
// momentum is the on-plan estimate-revision proxy.)
export type PriceTargetRevision = {
  lastMonthAvg: number | null;
  lastQuarterAvg: number | null;
  lastMonthCount: number;
  lastQuarterCount: number;
  changePct: number | null; // (lastMonth − lastQuarter) / lastQuarter
  direction: "raising" | "lowering" | "stable";
};

const TARGET_STABLE_BAND = 0.02; // <2% move is noise, not a revision

export function priceTargetRevision(
  s: PriceTargetSummary | null | undefined
): PriceTargetRevision | null {
  if (!s) return null;
  const lm = finite(s.lastMonthAvgPriceTarget);
  const lq = finite(s.lastQuarterAvgPriceTarget);
  if (lm === null && lq === null) return null;

  const changePct = lm !== null && lq !== null && lq !== 0 ? (lm - lq) / lq : null;
  const direction =
    changePct === null
      ? "stable"
      : changePct > TARGET_STABLE_BAND
        ? "raising"
        : changePct < -TARGET_STABLE_BAND
          ? "lowering"
          : "stable";

  return {
    lastMonthAvg: lm,
    lastQuarterAvg: lq,
    lastMonthCount: num(s.lastMonthCount),
    lastQuarterCount: num(s.lastQuarterCount),
    changePct,
    direction,
  };
}

export type EarningsSurprise = {
  date: string;
  epsActual: number | null;
  epsEstimated: number | null;
  surprisePct: number | null; // (actual − est) / |est|
  beat: boolean | null;
};

export type SurpriseHistory = {
  quarters: EarningsSurprise[]; // most recent reported first
  beatRate: number | null; // fraction of quarters that beat
};

export function earningsSurpriseHistory(
  earnings: readonly EarningsRow[] | null | undefined,
  limit = 8
): SurpriseHistory {
  const reported = (earnings ?? [])
    .filter((e) => e.epsActual !== null && Number.isFinite(e.epsActual))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((e): EarningsSurprise => {
      const est = e.epsEstimated;
      const act = e.epsActual as number;
      const haveEst = est !== null && Number.isFinite(est);
      return {
        date: e.date,
        epsActual: act,
        epsEstimated: haveEst ? est : null,
        surprisePct: haveEst && est !== 0 ? (act - (est as number)) / Math.abs(est as number) : null,
        beat: haveEst ? act >= (est as number) : null,
      };
    });

  const scored = reported.filter((q) => q.beat !== null);
  const beatRate = scored.length > 0 ? scored.filter((q) => q.beat).length / scored.length : null;
  return { quarters: reported, beatRate };
}
