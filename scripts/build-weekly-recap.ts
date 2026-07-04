/**
 * Generates a weekly forward-track recap from the daily snapshot ledger.
 *
 * Picks the most-recent snapshot file in data/snapshots/ as the END,
 * then finds the snapshot from ~7 calendar days earlier as the START
 * (or the closest available one if the exact date is missing — e.g.
 * weekends / holidays). Runs analyzeWeek() and writes the result to
 * data/recaps/{end-date}.json.
 *
 * Idempotent — running twice on the same week overwrites the same file.
 *
 * Local: npm run weekly-recap
 * CI:    .github/workflows/weekly-recap.yml runs Mondays at 14:00 UTC
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { analyzeWeek, type SnapshotFile } from "../lib/recaps";
import { loadSplits, splitFactorForStore } from "../lib/splits";

const ROOT = process.cwd();
const SNAPSHOTS_DIR = path.resolve(ROOT, "data", "snapshots");
const RECAPS_DIR = path.resolve(ROOT, "data", "recaps");
const TARGET_GAP_DAYS = 7;

function listSnapshotDates(): string[] {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  return fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function loadSnapshot(date: string): SnapshotFile | null {
  const file = path.join(SNAPSHOTS_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as SnapshotFile;
}

function dateMinusDays(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

/**
 * Find the snapshot whose date is closest to (target) without exceeding it
 * — we always want the prior period's data, never future data.
 */
function findClosestPriorSnapshot(target: string, available: string[]): string | null {
  const targetMs = new Date(`${target}T00:00:00Z`).getTime();
  let best: { date: string; gap: number } | null = null;
  for (const d of available) {
    const ms = new Date(`${d}T00:00:00Z`).getTime();
    if (ms > targetMs) continue;
    const gap = targetMs - ms;
    if (best === null || gap < best.gap) {
      best = { date: d, gap };
    }
  }
  return best?.date ?? null;
}

function main() {
  const dates = listSnapshotDates();
  if (dates.length < 2) {
    console.error(
      `Need at least 2 snapshots to build a recap; have ${dates.length}. Skipping.`
    );
    process.exit(0);
  }

  // Default: recap the latest snapshot. `--end YYYY-MM-DD` rebuilds a specific
  // historical week in place (e.g. to re-emit it with split-basis correction).
  const endArgIdx = process.argv.indexOf("--end");
  const endOverride = endArgIdx >= 0 ? process.argv[endArgIdx + 1] : undefined;
  if (endOverride && !dates.includes(endOverride)) {
    console.error(`--end ${endOverride} has no snapshot in data/snapshots.`);
    process.exit(1);
  }
  const endDate = endOverride ?? dates[dates.length - 1];
  const priorDates = dates.filter((d) => d < endDate);
  const startTarget = dateMinusDays(endDate, TARGET_GAP_DAYS);
  const startDate = findClosestPriorSnapshot(startTarget, priorDates);

  if (!startDate) {
    console.error(
      `Couldn't find a start snapshot ~${TARGET_GAP_DAYS} days before ${endDate}; only have ${dates[0]}. Need more snapshot history.`
    );
    process.exit(0);
  }

  const start = loadSnapshot(startDate);
  const end = loadSnapshot(endDate);
  if (!start || !end) {
    console.error(`Failed to load snapshot files: ${startDate} or ${endDate}`);
    process.exit(1);
  }

  console.log(
    `Building recap: ${startDate} → ${endDate} (${start.picks.length} → ${end.picks.length} tickers)`
  );
  // Split-basis correction (#76): a week straddling a split boundary must not
  // print a phantom "worst mover" from an old-basis entry vs new-basis exit.
  const splits = loadSplits();
  const recap = analyzeWeek(start, startDate, end, endDate, {
    splitFactor: (ticker) => splitFactorForStore(splits, ticker, startDate, endDate),
  });

  if (!fs.existsSync(RECAPS_DIR)) {
    fs.mkdirSync(RECAPS_DIR, { recursive: true });
  }
  const out = path.join(RECAPS_DIR, `${endDate}.json`);
  fs.writeFileSync(out, JSON.stringify(recap, null, 2) + "\n");

  console.log(`Wrote ${out}`);
  console.log(`  rows: ${recap.rowCount}`);
  console.log(
    `  universe avg: ${recap.startUniverseAvg.toFixed(1)} → ${recap.endUniverseAvg.toFixed(1)}`
  );
  for (const h of recap.hitStats) {
    console.log(
      `  ${h.signal}: ${h.correctCount}/${h.count} correct (${(h.hitRate * 100).toFixed(0)}%), avg return ${(h.averageReturn * 100).toFixed(2)}%`
    );
  }
  console.log(`  signal flips: ${recap.signalFlips.length}`);
}

main();
