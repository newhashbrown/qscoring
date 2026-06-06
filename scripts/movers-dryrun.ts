/**
 * PHASE 4 dry-run. Runs the live movers populate logic against the LATEST
 * committed snapshot (treated as "today's picks") + its prior, and PRINTS the
 * result. Writes nothing, touches no D1, deploys nothing.
 *
 *   npx tsx scripts/movers-dryrun.ts                # real FMP volume (needs FMP_API_KEY)
 *   npx tsx scripts/movers-dryrun.ts --mock-volume  # synthetic volume to exercise the filter
 */
import { listSnapshotDates, loadSnapshot } from "@/lib/performance";
import { buildMoversFile, type VolumeFetcher } from "@/lib/movers-live";
import { isDivergence, type MoverRow } from "@/lib/movers-board";

const MOCK = process.argv.includes("--mock-volume");

// Deterministic synthetic volume so the dollar-volume filter can be exercised
// without an FMP key. Spread thin→liquid so some names fall below the floor.
const mockFetcher: VolumeFetcher = async (tickers) => {
  const m = new Map<string, number>();
  for (const t of tickers) {
    let h = 0;
    for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    m.set(t, 30_000 + (h % 9_000_000)); // 30k … ~9M shares
  }
  return m;
};

function sample(rows: MoverRow[], n = 4) {
  return rows.slice(0, n).map((r) => ({
    ticker: r.ticker,
    ret: `${r.dayReturnPct > 0 ? "+" : ""}${(Math.round(r.dayReturnPct * 10) / 10).toFixed(1)}%`,
    close: r.close,
    volume: r.volume,
    dollarVolume: r.dollarVolume == null ? null : Math.round(r.dollarVolume),
    alignment: r.alignment,
    divergence: isDivergence(r.alignment),
  }));
}

async function main() {
  const dates = listSnapshotDates();
  if (dates.length < 2) {
    console.error(`Need >=2 committed snapshots (found ${dates.length}).`);
    return;
  }
  const todayDate = dates.at(-1)!;
  const priorDate = dates.at(-2)!;
  const today = loadSnapshot(todayDate);
  const prior = loadSnapshot(priorDate);
  if (!today || !prior) {
    console.error("Failed to load latest/prior snapshot.");
    return;
  }

  console.log(`\nDRY RUN — movers for ${todayDate}  (model scores as of ${priorDate})`);
  console.log(
    `universe: ${today.picks.length} · FMP_API_KEY present: ${Boolean(
      process.env.FMP_API_KEY
    )} · mock volume: ${MOCK}\n`
  );

  const file = await buildMoversFile(today, prior, {
    generatedAt: today.generatedAt,
    fetchVolume: MOCK ? mockFetcher : undefined,
  });

  const allRows = [...file.gainers, ...file.losers];
  const divCount = allRows.filter((r) => isDivergence(r.alignment)).length;
  const droppedNote = file.dollarVolumeApplied
    ? `dollar-volume floor $${file.dollarVolumeFloor?.toLocaleString()} APPLIED`
    : `dollar-volume floor SKIPPED (volume unavailable) — fell back to price floor $${file.priceFloor}`;

  console.log(`price floor: $${file.priceFloor}`);
  console.log(`${droppedNote}`);
  console.log(`gainers: ${file.gainers.length} · losers: ${file.losers.length} · divergences: ${divCount}\n`);

  console.log("Top gainers (sample):");
  console.log(JSON.stringify(sample(file.gainers), null, 2));
  console.log("\nTop losers (sample):");
  console.log(JSON.stringify(sample(file.losers), null, 2));
  console.log("\n(DRY RUN — no files written, no D1, no deploy.)");
}

main();
