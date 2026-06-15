/**
 * Weekly population of the filing-keyed fundamentals store
 * (migrations/0007_fundamentals_facts.sql, via /api/cron/persist-fundamentals).
 *
 * Iterates the committed compare-universe.json allow-list (the same universe
 * build-strong-picks.ts scores), fetches each ticker's 5-year income +
 * cash-flow statements directly from FMP, derives per-filing facts, and posts
 * them to the append-only store. Statements are quarterly-slow, so a weekly
 * cadence captures every new filing within days of release while keeping FMP
 * load trivial.
 *
 * Append-only + dedup on (ticker, fiscalPeriodEnd, filingDate) means re-runs
 * are idempotent: a filing already captured keeps its original as-reported
 * figures (the no-look-ahead integrity the store exists for).
 *
 * Run from a weekly GitHub Action, or locally:
 *   FMP_API_KEY=… SNAPSHOT_CRON_TOKEN=… npm run fundamentals
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { extractFundamentalFacts } from "../lib/scoring/fundamentals";
import type { CashFlowStatement, IncomeStatement } from "../lib/scoring/fmp";

const BASE = process.env.QSCORING_BASE ?? "https://qscoring.com";
const FMP_BASE = "https://financialmodelingprep.com/stable";
const STATEMENT_YEARS = 5;

// Two FMP calls per ticker, issued in parallel, with a gap between tickers:
// ~1 req/s sustained, far under FMP's 300/min ceiling. ~800 names ≈ 27 min.
const REQUEST_GAP_MS = 2000;
const REQUEST_TIMEOUT_MS = 25_000;

type UniverseFile = { entries?: Array<{ symbol?: string }> };

function fmpSymbol(symbol: string): string {
  return symbol.replace(/\./g, "-");
}

async function fmpGet<T>(pathname: string, symbol: string): Promise<T[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY is not set");
  const url = new URL(FMP_BASE + pathname);
  url.searchParams.set("symbol", fmpSymbol(symbol));
  url.searchParams.set("limit", String(STATEMENT_YEARS));
  url.searchParams.set("apikey", key);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body) ? (body as T[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function persist(ticker: string, facts: unknown[]): Promise<boolean> {
  const token = process.env.SNAPSHOT_CRON_TOKEN;
  if (!token) throw new Error("SNAPSHOT_CRON_TOKEN is not set — required to write the store");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/cron/persist-fundamentals`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, facts }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[${ticker}] persist HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[${ticker}] persist threw: ${err instanceof Error ? err.message : err}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function loadUniverse(): string[] {
  const p = path.resolve(process.cwd(), "data", "compare-universe.json");
  const file = JSON.parse(fs.readFileSync(p, "utf-8")) as UniverseFile;
  const symbols = (file.entries ?? [])
    .map((e) => (typeof e.symbol === "string" ? e.symbol.trim().toUpperCase() : ""))
    .filter(Boolean);
  return [...new Set(symbols)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const universe = loadUniverse();
  if (universe.length === 0) throw new Error("compare-universe.json had no entries");
  console.log(`Capturing fundamentals for ${universe.length} tickers via ${BASE}…`);

  let captured = 0;
  let skipped = 0;
  let failed = 0;
  for (const ticker of universe) {
    const [income, cashflow] = await Promise.all([
      fmpGet<IncomeStatement>("/income-statement", ticker),
      fmpGet<CashFlowStatement>("/cash-flow-statement", ticker),
    ]);
    const facts = extractFundamentalFacts(income, cashflow);
    if (facts.length === 0) {
      skipped += 1;
    } else if (await persist(ticker, facts)) {
      captured += 1;
    } else {
      failed += 1;
    }
    await sleep(REQUEST_GAP_MS);
  }

  console.log(
    `Done. captured=${captured} skipped(no facts)=${skipped} failed=${failed} of ${universe.length}.`
  );
  // Non-fatal: a partial run still appended whatever it could. Only a total
  // wipeout (everything failed) signals a broken token/endpoint worth failing.
  if (failed > 0 && captured === 0) {
    throw new Error("Every persist call failed — check SNAPSHOT_CRON_TOKEN and the persist route.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
