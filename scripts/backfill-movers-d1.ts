/**
 * One-shot: emit SQL to backfill the committed data/movers/<date>.json files
 * into the D1 `movers` table. Prints SQL to stdout (logs to stderr), so:
 *
 *   npx tsx scripts/backfill-movers-d1.ts > movers-backfill.sql
 *   CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler d1 execute qscoring-db --remote --file=movers-backfill.sql
 *
 * Idempotent (INSERT OR REPLACE on the snapshot_date+ticker PK). Historical
 * rows carry NULL volume/dollar_volume (no volume in the snapshots).
 */
import { listMoversDates, loadMovers } from "@/lib/movers-data";
import { moversFileToRows } from "@/lib/movers-live";

// SQLite literal: numbers as-is, null/undefined/non-finite → NULL, strings
// single-quoted with internal quotes doubled (the only escaping SQLite needs).
function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

const COLS =
  "(snapshot_date,ticker,company_name,sector,side,day_return_pct,close,prev_close," +
  "volume,dollar_volume,score_date,prior_composite,prior_signal,factor_value," +
  "factor_growth,factor_momentum,factor_profitability,factor_risk,alignment,alignment_note)";

function main() {
  const dates = listMoversDates();
  let rows = 0;
  for (const date of dates) {
    const file = loadMovers(date);
    if (!file) continue;
    for (const r of moversFileToRows(file)) {
      const vals = [
        date,
        r.ticker,
        r.companyName,
        r.sector,
        r.side,
        r.dayReturnPct,
        r.close,
        r.prevClose,
        r.volume,
        r.dollarVolume,
        r.scoreDate,
        r.priorComposite,
        r.priorSignal,
        r.factors.value,
        r.factors.growth,
        r.factors.momentum,
        r.factors.profitability,
        r.factors.risk,
        r.alignment,
        r.alignmentNote,
      ]
        .map(lit)
        .join(",");
      process.stdout.write(`INSERT OR REPLACE INTO movers ${COLS} VALUES (${vals});\n`);
      rows++;
    }
  }
  process.stderr.write(`Emitted ${rows} rows across ${dates.length} dates (${dates[0]} … ${dates.at(-1)}).\n`);
}

main();
