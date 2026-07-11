/**
 * Catalyst calendar ingest (AI-analysis roadmap, Phase 4).
 *
 * Fetches upcoming corporate events from FMP for a forward window, filters to the
 * scored universe, and FULL-REPLACES the ticker_events table via the Worker
 * (POST /api/cron/persist-events). Runs daily.
 *
 *   1. Bulk calendars (one call each): earnings-calendar, dividends-calendar,
 *      splits-calendar for [today, today+90d]. LOGS which endpoints returned data
 *      vs errored/402'd, so the first run reveals what the FMP plan includes.
 *   2. Earnings fallback: if the earnings calendar returns nothing (plan-gated),
 *      fall back to the known-working per-ticker fmp.earnings across the universe
 *      (paced) — earnings is the highest-value catalyst, so it never rides on an
 *      unverified endpoint.
 *   3. Persist a full replace (the route refuses an empty replace, so a bad FMP
 *      day can't wipe the calendar).
 *
 * Run:
 *   FMP_API_KEY=… SNAPSHOT_CRON_TOKEN=… npm run events
 *   FMP_API_KEY=… SNAPSHOT_CRON_TOKEN=… npm run events -- --dry-run
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fmp } from "../lib/scoring/fmp";
import {
  mapEarnings,
  mapDividends,
  mapSplits,
  filterUpcoming,
  type TickerEvent,
} from "../lib/events/types";

const BASE = process.env.QSCORING_BASE ?? "https://qscoring.com";
const WINDOW_DAYS = 90;
const EARNINGS_FALLBACK_GAP_MS = 200; // ~5 req/s, under FMP 300/min
const PERSIST_CHUNK = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function loadUniverse(): string[] {
  const p = path.resolve(process.cwd(), "data", "compare-universe.json");
  const file = JSON.parse(fs.readFileSync(p, "utf-8")) as { entries?: Array<{ symbol?: string }> };
  return [
    ...new Set(
      (file.entries ?? [])
        .map((e) => (typeof e.symbol === "string" ? e.symbol.trim().toUpperCase() : ""))
        .filter(Boolean)
    ),
  ];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Per-ticker earnings fallback: nearest future scheduled report per ticker. */
async function earningsFallback(universe: string[], asOf: string): Promise<TickerEvent[]> {
  console.log(`  earnings fallback: per-ticker across ${universe.length} names (paced)…`);
  const out: TickerEvent[] = [];
  for (const ticker of universe) {
    const rows = await fmp.earnings(ticker, 8).catch(() => []);
    // Nearest future row (no actual yet) is the next scheduled report.
    const future = rows
      .filter((r) => typeof r.date === "string" && r.date.slice(0, 10) >= asOf)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (future) {
      out.push({
        ticker,
        eventType: "earnings",
        eventDate: future.date.slice(0, 10),
        details: { epsEstimated: future.epsEstimated ?? null, revenueEstimated: null },
      });
    }
    await sleep(EARNINGS_FALLBACK_GAP_MS);
  }
  return out;
}

async function persist(rows: unknown[], token: string): Promise<{ written: number; replaced: boolean }> {
  let written = 0;
  let replaced = false;
  // Single request when it fits (a full replace must be atomic); chunk only as a
  // guard for pathologically large windows.
  for (const group of chunk(rows, PERSIST_CHUNK)) {
    const res = await fetch(`${BASE}/api/cron/persist-events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rows: group }),
    });
    if (!res.ok) {
      console.warn(`persist HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const body = (await res.json()) as { written?: number; replaced?: boolean };
    written += body.written ?? 0;
    replaced = replaced || Boolean(body.replaced);
  }
  return { written, replaced };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const token = process.env.SNAPSHOT_CRON_TOKEN;
  if (!token && !dryRun) throw new Error("SNAPSHOT_CRON_TOKEN is not set — required to persist");
  if (!process.env.FMP_API_KEY) throw new Error("FMP_API_KEY is not set");

  const asOf = ymd(new Date());
  const to = ymd(new Date(Date.now() + WINDOW_DAYS * 86_400_000));
  const universe = new Set(loadUniverse());
  console.log(`Events: window ${asOf} → ${to}, universe ${universe.size}, base ${BASE}`);

  // 1. Bulk calendars — log availability per endpoint.
  const [earn, div, split] = await Promise.all([
    fmp.earningsCalendar(asOf, to).then((r) => ({ ok: true, rows: r }), (e) => ({ ok: false, rows: [], err: e })),
    fmp.dividendsCalendar(asOf, to).then((r) => ({ ok: true, rows: r }), (e) => ({ ok: false, rows: [], err: e })),
    fmp.splitsCalendar(asOf, to).then((r) => ({ ok: true, rows: r }), (e) => ({ ok: false, rows: [], err: e })),
  ]);
  const status = (label: string, s: { ok: boolean; rows: unknown[]; err?: unknown }) =>
    console.log(`  ${label.padEnd(10)} ${s.ok ? `OK (${s.rows.length} rows)` : `FAILED (${s.err instanceof Error ? s.err.message.slice(0, 60) : "error"})`}`);
  status("earnings", earn);
  status("dividends", div);
  status("splits", split);

  let events: TickerEvent[] = [
    ...mapEarnings(earn.rows as Parameters<typeof mapEarnings>[0]),
    ...mapDividends(div.rows as Parameters<typeof mapDividends>[0]),
    ...mapSplits(split.rows as Parameters<typeof mapSplits>[0]),
  ];

  // 2. Earnings fallback when the calendar yielded no earnings.
  const hasEarnings = events.some((e) => e.eventType === "earnings");
  if (!hasEarnings) {
    const fb = await earningsFallback([...universe], asOf);
    events = [...events, ...fb];
  }

  // 3. Universe + upcoming filter.
  const upcoming = filterUpcoming(events, universe, asOf);
  const byType = upcoming.reduce<Record<string, number>>((a, e) => ((a[e.eventType] = (a[e.eventType] ?? 0) + 1), a), {});
  console.log(`  upcoming in-universe: ${upcoming.length} (${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(" ") || "none"})`);

  if (dryRun) {
    console.log("\n--- DRY RUN: first 10 events ---");
    console.log(JSON.stringify(upcoming.slice(0, 10), null, 2));
    return;
  }

  const rows = upcoming.map((e) => ({ ticker: e.ticker, eventType: e.eventType, eventDate: e.eventDate, details: e.details }));
  const { written, replaced } = await persist(rows, token!);
  console.log(`\nDone. written=${written} replaced=${replaced}`);
  if (rows.length > 0 && !replaced) {
    throw new Error(`Persist did not replace (written=${written}) despite ${rows.length} events — check the persist route.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
