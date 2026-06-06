/**
 * Live daily population for the Movers board (PHASE 4). Runs in the daily
 * pipeline immediately after the snapshot is persisted, with today's freshly
 * scored picks in memory and yesterday's committed snapshot on disk.
 *
 * Difference from the historical backfill (scripts/build-movers.ts): the
 * liquidity floor here adds a DOLLAR-VOLUME threshold. Volume isn't in the
 * snapshots, so we fetch it from FMP for a wider candidate set (top ~75 by
 * change_percent per side), then keep the top 25 that clear price + dollar
 * volume. If volume can't be fetched at all (no key / FMP outage), it falls
 * back to the price floor alone so the board still publishes.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fmp } from "./scoring/fmp";
import { listSnapshotDates, loadSnapshot } from "./performance";
import { reconcile, type DatedSnapshot, type MoverRow, type MoversFile } from "./movers-board";
import type { ScoreboardPick } from "@/data/categories";

const MOVERS_DIR = path.resolve(process.cwd(), "data", "movers");
const PRICE_FLOOR = 5; // USD
const DOLLAR_VOLUME_FLOOR = 5_000_000; // USD/day — liquidity guard against thin names
const CANDIDATE_N = 75; // per side, before the dollar-volume filter
const TOP_N = 25; // per side, after
const VOLUME_CONCURRENCY = 6;

export type VolumeFetcher = (tickers: string[]) => Promise<Map<string, number>>;

async function withConcurrency<T>(
  items: readonly string[],
  concurrency: number,
  fn: (item: string) => Promise<T | null>
): Promise<Array<T | null>> {
  const out: Array<T | null> = new Array(items.length).fill(null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

/** Default volume source: FMP quote.volume (reuses the existing client). */
export const fmpVolumeFetcher: VolumeFetcher = async (tickers) => {
  const map = new Map<string, number>();
  const results = await withConcurrency(tickers, VOLUME_CONCURRENCY, async (ticker) => {
    try {
      const q = (await fmp.quote(ticker))[0];
      const v = q?.volume;
      return v != null && Number.isFinite(v) ? { ticker, volume: v } : null;
    } catch {
      return null; // a single failed quote just means that name is unverifiable
    }
  });
  for (const r of results) if (r) map.set(r.ticker, r.volume);
  return map;
};

export type BuildOpts = {
  generatedAt: string;
  fetchVolume?: VolumeFetcher;
};

/**
 * Build the MoversFile for one day: reconcile, price floor, candidate set,
 * dollar-volume filter, top-N per side. Pure aside from the injected volume
 * fetch (override fetchVolume in tests / dry-runs).
 */
export async function buildMoversFile(
  today: DatedSnapshot,
  prior: DatedSnapshot,
  opts: BuildOpts
): Promise<MoversFile> {
  const fetchVolume = opts.fetchVolume ?? fmpVolumeFetcher;
  const rows = reconcile(today, prior);
  const eligible = rows.filter((r) => Number.isFinite(r.close) && r.close >= PRICE_FLOOR);

  const gainerCands = eligible
    .filter((r) => r.dayReturnPct > 0)
    .sort((a, b) => b.dayReturnPct - a.dayReturnPct)
    .slice(0, CANDIDATE_N);
  const loserCands = eligible
    .filter((r) => r.dayReturnPct < 0)
    .sort((a, b) => a.dayReturnPct - b.dayReturnPct)
    .slice(0, CANDIDATE_N);

  const tickers = [...new Set([...gainerCands, ...loserCands].map((r) => r.ticker))];
  let volumes: Map<string, number>;
  try {
    volumes = await fetchVolume(tickers);
  } catch {
    volumes = new Map();
  }
  const applied = volumes.size > 0;

  const attach = (r: MoverRow): MoverRow => {
    const raw = volumes.get(r.ticker);
    const volume = raw != null && Number.isFinite(raw) ? raw : null;
    return { ...r, volume, dollarVolume: volume != null ? volume * r.close : null };
  };

  const select = (cands: MoverRow[]): MoverRow[] => {
    const withVol = cands.map(attach);
    // No volume resolved at all → fall back to the price floor so we still
    // publish a board. Otherwise drop names below the dollar-volume floor
    // (and names with no volume, which we can't verify as liquid).
    if (!applied) return withVol.slice(0, TOP_N);
    return withVol
      .filter((r) => r.dollarVolume != null && r.dollarVolume >= DOLLAR_VOLUME_FLOOR)
      .slice(0, TOP_N);
  };

  return {
    date: today.date,
    scoreDate: prior.date,
    universeSize: today.picks.length,
    priceFloor: PRICE_FLOOR,
    dollarVolumeFloor: DOLLAR_VOLUME_FLOOR,
    dollarVolumeApplied: applied,
    generatedAt: opts.generatedAt,
    gainers: select(gainerCands),
    losers: select(loserCands),
  };
}

/** Write data/movers/<date>.json and refresh latest.json. */
export function writeMoversFiles(file: MoversFile): void {
  if (!fs.existsSync(MOVERS_DIR)) fs.mkdirSync(MOVERS_DIR, { recursive: true });
  const body = JSON.stringify(file, null, 2) + "\n";
  fs.writeFileSync(path.join(MOVERS_DIR, `${file.date}.json`), body);
  fs.writeFileSync(path.join(MOVERS_DIR, "latest.json"), body);
}

/**
 * Daily entry point: reconcile `picks` for `snapshotDate` against the latest
 * committed snapshot strictly before it, then write the movers files. Returns
 * a short summary, or null if there's no prior snapshot to reconcile against.
 */
export async function publishMoversForDate(
  snapshotDate: string,
  generatedAt: string,
  picks: ScoreboardPick[]
): Promise<MoversFile | null> {
  const priorDate = listSnapshotDates()
    .filter((d) => d < snapshotDate)
    .at(-1);
  if (!priorDate) return null;
  const prior = loadSnapshot(priorDate);
  if (!prior) return null;

  const today: DatedSnapshot = { date: snapshotDate, picks };
  const file = await buildMoversFile(today, prior, { generatedAt });
  writeMoversFiles(file);
  return file;
}

/** Flatten a MoversFile to the row shape the persist-movers route expects. */
export function moversFileToRows(file: MoversFile) {
  const rowsOf = (rows: MoverRow[], side: "gainer" | "loser") =>
    rows.map((r) => ({
      ticker: r.ticker,
      companyName: r.companyName,
      sector: r.sector,
      side,
      dayReturnPct: r.dayReturnPct,
      close: r.close,
      prevClose: r.prevClose,
      volume: r.volume ?? null,
      dollarVolume: r.dollarVolume ?? null,
      scoreDate: r.scoreDate,
      priorComposite: r.priorComposite,
      priorSignal: r.priorSignal,
      factors: r.factors,
      alignment: r.alignment,
      alignmentNote: r.alignmentNote,
    }));
  return [...rowsOf(file.gainers, "gainer"), ...rowsOf(file.losers, "loser")];
}
