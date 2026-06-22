/**
 * Performance / forward-tracking helpers.
 *
 * Reads the daily snapshot files in data/snapshots/ written by the
 * build-strong-picks script and exposes the data plus structural stats
 * to /performance. Snapshots are append-only — once a date file is
 * written it is never modified, which is the "no look-ahead bias by
 * construction" property we lean on for the validation story.
 *
 * Forward-return computation (IC, quintile spreads) lives here too but
 * only fires when there's enough data to be meaningful — for short
 * windows we just report "data still accumulating."
 */

import fs from "node:fs";
import path from "node:path";
import type { ScoreboardPick } from "@/data/categories";
import { isUsTradingDay, marketCloseDate } from "@/lib/market-date";

export type Snapshot = {
  date: string; // YYYY-MM-DD (UTC)
  generatedAt: string; // full ISO timestamp
  picks: ScoreboardPick[];
};

const SNAPSHOTS_DIR = path.resolve(process.cwd(), "data", "snapshots");

// Number of trading days from snapshot to the forward-return horizon. We
// approximate calendar months at ~21 trading days. Real backtests should
// use an exchange calendar; for the live dashboard this approximation is
// fine until we publish formal IC numbers.
export const HORIZONS = [
  { days: 21, label: "1-month" },
  { days: 63, label: "3-month" },
  { days: 126, label: "6-month" },
  { days: 252, label: "1-year" },
] as const;

export function listSnapshotDates(): string[] {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  return fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function loadSnapshot(date: string): Snapshot | null {
  const file = path.join(SNAPSHOTS_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    generatedAt: string;
    picks: ScoreboardPick[];
  };
  return { date, generatedAt: raw.generatedAt, picks: raw.picks };
}

export type PerformanceSummary = {
  trackedSinceDate: string | null;
  daysCaptured: number;
  totalObservations: number;
  averageTickersPerSnapshot: number;
  latestSnapshot: Snapshot | null;
  // For each forward horizon, whether enough trading days have passed
  // since the first snapshot to publish a meaningful IC number.
  horizonStatus: Array<{
    label: string;
    days: number;
    available: boolean;
    daysRemaining: number;
  }>;
};

export function tradingDaysBetween(startDate: string, endDate: string): number {
  // Count actual US trading days in (startDate, endDate] — ET weekdays minus
  // NYSE holidays (lib/market-date). Replaces the old 5/7 calendar-day
  // approximation, which over-counted across holiday weeks and skewed both
  // horizon readiness and IC cohort partner selection (issue #48). Each step
  // is anchored at 12:00 UTC so its ET calendar day matches the intended date
  // (a UTC-midnight instant maps to the prior ET evening).
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (!(end.getTime() > start.getTime())) return 0;

  let count = 0;
  const cur = new Date(start);
  cur.setUTCDate(cur.getUTCDate() + 1); // exclusive of start, inclusive of end
  while (cur.getTime() <= end.getTime()) {
    if (isUsTradingDay(cur)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function summarizePerformance(): PerformanceSummary {
  const dates = listSnapshotDates();
  if (dates.length === 0) {
    return {
      trackedSinceDate: null,
      daysCaptured: 0,
      totalObservations: 0,
      averageTickersPerSnapshot: 0,
      latestSnapshot: null,
      horizonStatus: HORIZONS.map((h) => ({
        label: h.label,
        days: h.days,
        available: false,
        daysRemaining: h.days,
      })),
    };
  }

  const latestDate = dates[dates.length - 1];
  const latestSnapshot = loadSnapshot(latestDate);

  // Compute totals by reading every snapshot. Cheap because each is small
  // and the page revalidates daily.
  let totalObservations = 0;
  let firstSnapshotGeneratedAt: string | null = null;
  for (const date of dates) {
    const snap = loadSnapshot(date);
    if (!snap) continue;
    totalObservations += snap.picks.length;
    if (firstSnapshotGeneratedAt === null) {
      firstSnapshotGeneratedAt = snap.generatedAt;
    }
  }

  // The "tracked since" date is the US market close the FIRST snapshot
  // captures, not the UTC filename. The UTC date can be one calendar day
  // ahead of the actual market session for snapshots committed late at
  // night ET, which made the page read as "tracking since tomorrow."
  const trackedSinceDate = firstSnapshotGeneratedAt
    ? marketCloseDate(firstSnapshotGeneratedAt)
    : null;

  const today = new Date().toISOString().split("T")[0];
  const tradingDaysSinceFirst = trackedSinceDate
    ? tradingDaysBetween(trackedSinceDate, today)
    : 0;

  return {
    trackedSinceDate,
    daysCaptured: dates.length,
    totalObservations,
    averageTickersPerSnapshot:
      dates.length > 0 ? Math.round(totalObservations / dates.length) : 0,
    latestSnapshot,
    horizonStatus: HORIZONS.map((h) => ({
      label: h.label,
      days: h.days,
      available: tradingDaysSinceFirst >= h.days,
      daysRemaining: Math.max(0, h.days - tradingDaysSinceFirst),
    })),
  };
}
