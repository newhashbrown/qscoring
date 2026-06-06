/**
 * PHASE 5 — Movers alignment backtest (standalone, read-only).
 *
 * For every mover in data/movers/<date>.json, compute the forward
 * N-trading-day return (default 5) using committed snapshot closes, then
 * average by alignment bucket. Entry = the mover's close on day T; exit =
 * that ticker's close N trading days later (next snapshot file + N).
 *
 * Reads committed JSON only — no D1, no FMP, no network. Heavily caveated:
 * the sample is tiny and accrues over time; this is diagnostic, not a
 * validated performance claim, and not advice.
 *
 *   npx tsx scripts/movers-backtest.ts          # 5-day horizon
 *   npx tsx scripts/movers-backtest.ts --h 10   # custom horizon
 */
import { listSnapshotDates, loadSnapshot } from "@/lib/performance";
import { listMoversDates, loadMovers } from "@/lib/movers-data";
import { isDivergence, type Alignment } from "@/lib/movers-board";

const hArg = process.argv.indexOf("--h");
const HORIZON = hArg >= 0 ? Math.max(1, parseInt(process.argv[hArg + 1] ?? "5", 10)) : 5;

const ALIGNMENTS: Alignment[] = [
  "confirmed_strength",
  "unsupported_pop",
  "unscored_pop",
  "confirmed_weakness",
  "dislocation",
  "unscored_drop",
];

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}
function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100 >= 0 ? "+" : "")}${(x * 100).toFixed(2)}%` : "—";
}

function main() {
  const snapDates = listSnapshotDates(); // ascending trading days with prices
  const idxOf = new Map(snapDates.map((d, i) => [d, i]));

  // Lazy price lookup per snapshot date: ticker → close.
  const priceCache = new Map<string, Map<string, number>>();
  const pricesOn = (date: string): Map<string, number> => {
    let m = priceCache.get(date);
    if (!m) {
      const snap = loadSnapshot(date);
      m = new Map((snap?.picks ?? []).map((p) => [p.ticker, p.price]));
      priceCache.set(date, m);
    }
    return m;
  };

  const byAlignment = new Map<Alignment, number[]>(ALIGNMENTS.map((a) => [a, []]));
  let rowsTotal = 0;
  let rowsWithForward = 0;

  for (const moverDate of listMoversDates()) {
    const file = loadMovers(moverDate);
    if (!file) continue;
    const i = idxOf.get(moverDate);
    if (i === undefined) continue;
    const fwdDate = snapDates[i + HORIZON];
    const fwdPrices = fwdDate ? pricesOn(fwdDate) : null;

    for (const row of [...file.gainers, ...file.losers]) {
      rowsTotal++;
      if (!fwdPrices) continue;
      const exit = fwdPrices.get(row.ticker);
      if (exit == null || !Number.isFinite(exit) || !row.close) continue;
      const fwd = exit / row.close - 1;
      byAlignment.get(row.alignment)!.push(fwd);
      rowsWithForward++;
    }
  }

  console.log(`\nMovers alignment backtest — forward ${HORIZON}-trading-day return`);
  console.log(`snapshots: ${snapDates.length} (${snapDates[0]} … ${snapDates.at(-1)})`);
  console.log(
    `mover rows: ${rowsTotal} total, ${rowsWithForward} with a +${HORIZON}d close available\n`
  );

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`${pad("alignment", 20)}${pad("n", 6)}${pad("avg fwd return", 16)}divergence`);
  console.log("-".repeat(54));
  for (const a of ALIGNMENTS) {
    const xs = byAlignment.get(a)!;
    console.log(
      `${pad(a, 20)}${pad(String(xs.length), 6)}${pad(pct(mean(xs)), 16)}${
        isDivergence(a) ? "★" : ""
      }`
    );
  }

  // Grouped view: the differentiator (divergences) vs the rest.
  const grouped = (pred: (a: Alignment) => boolean) =>
    ALIGNMENTS.filter(pred).flatMap((a) => byAlignment.get(a)!);
  const divs = grouped(isDivergence);
  const confirmed = grouped((a) => a === "confirmed_strength" || a === "confirmed_weakness");
  const unscored = grouped((a) => a === "unscored_pop" || a === "unscored_drop");
  console.log("-".repeat(54));
  console.log(`${pad("divergences ★", 20)}${pad(String(divs.length), 6)}${pct(mean(divs))}`);
  console.log(`${pad("confirmed", 20)}${pad(String(confirmed.length), 6)}${pct(mean(confirmed))}`);
  console.log(`${pad("unscored", 20)}${pad(String(unscored.length), 6)}${pct(mean(unscored))}`);

  console.log(
    `\nCAVEATS: tiny sample that grows daily; equal-weighted; raw price return, ` +
      `NOT risk-adjusted or benchmark-relative; survivorship bias (snapshots ` +
      `contain only currently-listed names); rows whose +${HORIZON}d close isn't ` +
      `committed yet are excluded. Diagnostic only — not a performance claim, not advice.`
  );
}

main();
