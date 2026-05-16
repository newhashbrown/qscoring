/**
 * Seeds D1's score_snapshots table from the on-disk data/snapshots/*.json
 * ledger. Idempotent: re-runs upsert. Skips files whose name isn't a valid
 * YYYY-MM-DD date.
 *
 * Each snapshot is POSTed to /api/cron/persist-snapshot exactly the way the
 * daily run does it, so this path and the daily path share the same
 * validation, write, and conflict-resolution logic — no second code path
 * to keep in sync.
 *
 * Run locally:
 *   QSCORING_BASE=https://qscoring.com \
 *   SNAPSHOT_CRON_TOKEN=<token> \
 *   npx tsx scripts/backfill-snapshots.ts
 *
 * Optional: --dry-run prints what would be posted without sending.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = process.env.QSCORING_BASE ?? "https://qscoring.com";
const TOKEN = process.env.SNAPSHOT_CRON_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

const DATE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

// Same shape build-strong-picks.ts writes — only the fields we need.
type SnapshotFile = {
  generatedAt: string;
  universeSize: number;
  picks: Array<{
    ticker: string;
    companyName: string;
    price: number;
    changePercent: number;
    composite: number;
    signal: string;
    confidence: string;
    longTermScore: number;
    shortTermScore: number;
    categories: Array<{ name: string; label: string; score: number }>;
  }>;
};

async function postSnapshot(snapshotDate: string, file: SnapshotFile): Promise<void> {
  const url = `${BASE}/api/cron/persist-snapshot`;
  const body = JSON.stringify({ snapshotDate, picks: file.picks });

  if (DRY_RUN) {
    console.log(`[dry-run] ${snapshotDate}: ${file.picks.length} picks → ${url}`);
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    console.log(`${snapshotDate}: ${text}`);
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  if (!DRY_RUN && !TOKEN) {
    console.error("SNAPSHOT_CRON_TOKEN env var required (or pass --dry-run).");
    process.exit(1);
  }

  const dir = path.resolve(process.cwd(), "data", "snapshots");
  if (!fs.existsSync(dir)) {
    console.error(`No snapshots directory at ${dir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => DATE_RE.test(f))
    .sort(); // chronological, oldest → newest

  if (files.length === 0) {
    console.log("No snapshot files found — nothing to backfill.");
    return;
  }

  console.log(`Backfilling ${files.length} snapshot file(s) into ${BASE}…`);

  let ok = 0;
  let failed = 0;
  for (const name of files) {
    const snapshotDate = name.replace(/\.json$/, "");
    const raw = fs.readFileSync(path.join(dir, name), "utf-8");
    let parsed: SnapshotFile;
    try {
      parsed = JSON.parse(raw) as SnapshotFile;
    } catch (err) {
      console.warn(`${name}: invalid JSON — skipping (${err instanceof Error ? err.message : err})`);
      failed++;
      continue;
    }
    if (!Array.isArray(parsed.picks) || parsed.picks.length === 0) {
      console.warn(`${name}: no picks — skipping`);
      failed++;
      continue;
    }
    try {
      await postSnapshot(snapshotDate, parsed);
      ok++;
    } catch (err) {
      console.warn(`${name}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`Done. upserted=${ok} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
