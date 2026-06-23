/**
 * Historical backfill for the "Movers vs. Fundamentals" board (PHASE 2).
 *
 * One-shot, deterministic, idempotent. Walks every committed snapshot in
 * data/snapshots/, pairs each date with its LATEST prior snapshot (the
 * immediately-preceding committed trading day — anti-lookahead), runs the
 * pure reconcile() from lib/movers-board, and writes:
 *
 *   data/movers/<date>.json   — top 25 gainers + top 25 losers for that day
 *   data/movers/latest.json   — a copy of the most recent date's file
 *
 * Liquidity floor for the BACKFILL is a PRICE floor only ($5) — historical
 * snapshots don't carry volume, so dollar-volume filtering is deferred to the
 * live daily step (PHASE 4). Ranking is by change_percent, verbatim.
 *
 * Output carries no wall-clock timestamp (generatedAt is copied from the
 * source snapshot), so re-running on unchanged snapshots is byte-stable —
 * no git churn.
 *
 * Run:  npx tsx scripts/build-movers.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { listSnapshotDates, loadSnapshot } from "@/lib/performance";
import { isUsTradingDate } from "@/lib/market-date";
import { reconcile, isDivergence, type MoverRow, type MoversFile } from "@/lib/movers-board";

const MOVERS_DIR = path.resolve(process.cwd(), "data", "movers");
const PRICE_FLOOR = 5; // USD; backfill liquidity proxy (no volume in history)
const TOP_N = 25;

function rank(rows: MoverRow[]): { gainers: MoverRow[]; losers: MoverRow[] } {
  const eligible = rows.filter((r) => Number.isFinite(r.close) && r.close >= PRICE_FLOOR);
  const gainers = eligible
    .filter((r) => r.dayReturnPct > 0)
    .sort((a, b) => b.dayReturnPct - a.dayReturnPct)
    .slice(0, TOP_N);
  const losers = eligible
    .filter((r) => r.dayReturnPct < 0)
    .sort((a, b) => a.dayReturnPct - b.dayReturnPct)
    .slice(0, TOP_N);
  return { gainers, losers };
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function main(): void {
  const dates = listSnapshotDates(); // ascending
  if (dates.length < 2) {
    console.error(
      `Need at least 2 committed snapshots to build movers (found ${dates.length}). Nothing to do.`
    );
    return;
  }

  if (!fs.existsSync(MOVERS_DIR)) fs.mkdirSync(MOVERS_DIR, { recursive: true });

  let written = 0;
  let lastFile: MoversFile | null = null;

  // Start at index 1: the earliest snapshot has no prior, so it can't be
  // reconciled into a movers board (every row would be unscored).
  for (let i = 1; i < dates.length; i++) {
    const todayDate = dates[i];
    const priorDate = dates[i - 1]; // latest snapshot strictly before T
    const today = loadSnapshot(todayDate);
    const prior = loadSnapshot(priorDate);
    if (!today || !prior) {
      console.warn(`  skip ${todayDate}: missing snapshot file (today or prior).`);
      continue;
    }
    // Defense-in-depth: snapshots are trading-day-only by construction, but
    // never build a board for a phantom weekend/holiday date if one ever slips
    // into data/snapshots/ (the 2026-06-19 class of contamination).
    if (!isUsTradingDate(todayDate)) {
      console.warn(`  skip ${todayDate}: not a US trading day (weekend/holiday).`);
      continue;
    }

    const rows = reconcile(today, prior);
    const { gainers, losers } = rank(rows);

    const payload: MoversFile = {
      date: todayDate,
      scoreDate: priorDate,
      universeSize: today.picks.length,
      priceFloor: PRICE_FLOOR,
      generatedAt: today.generatedAt,
      gainers,
      losers,
    };

    writeJson(path.join(MOVERS_DIR, `${todayDate}.json`), payload);
    written++;
    lastFile = payload;

    const div =
      gainers.filter((r) => isDivergence(r.alignment)).length +
      losers.filter((r) => isDivergence(r.alignment)).length;
    console.log(
      `  ${todayDate}  (scores ${priorDate})  gainers ${gainers.length}  losers ${losers.length}  divergences ${div}`
    );
  }

  if (lastFile) {
    writeJson(path.join(MOVERS_DIR, "latest.json"), lastFile);
    console.log(`\nWrote ${written} dated file(s) + latest.json (latest = ${lastFile.date}).`);
    console.log(`Date range: ${dates[1]} … ${dates[dates.length - 1]} (prior of each is the preceding trading day).`);
  }
}

main();
