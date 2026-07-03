/**
 * Single source of truth for the QScore investable universe.
 *
 * Why this module exists: the company-screener call + filter used to be
 * copy-pasted across build-strong-picks.ts, build-universe-stats.ts and
 * build-sitemap-tickers.ts. Two of the three copies forgot to exclude
 * funds/ETFs, so ~53% of the scored universe was mutual-fund share classes
 * (JPMorgan U.S. Equity Fund, the American Funds target-date series) and ETFs
 * — all classified "Financial Services", all lacking fundamentals, yet still
 * emitting BUY/HOLD signals. That pushed Financial Services to 60% of the
 * universe. Consolidating the screener + filter here means the fund exclusion
 * can never drift between the scorer and its z-score normalization corpus.
 *
 * Type filter: FMP's `isEtf` / `isFund` flags are UNRELIABLE — on 2026-06-23
 * the screener returned ~30 mutual-fund share classes (AAFTX, ABALX, DFSVX …)
 * AND a leveraged ETF (TQQQ), every one tagged `isFund=false isEtf=false
 * exchange=NASDAQ`, which sailed past the flag check and displaced 30 real
 * large-caps (AON, ASML, Digital Realty) out of the 800-cap. So the flags are
 * necessary but not sufficient. We add two FLAG-INDEPENDENT discriminators:
 *   - the mutual-fund ticker shape (5 letters ending in X) — ticker-, not
 *     name-based, so it never touches REIT names like Digital Realty Trust,
 *     and is verified to match ZERO of the clean 800 real names; and
 *   - a NARROW ETF-issuer name list (ProShares, Direxion, iShares …) for
 *     ETFs the ticker shape can't catch.
 * Generic name tokens (Trust / REIT / Strategy / Index) stay banned — they
 * wrongly delete Digital Realty, Federal Realty, Essex, Strategy Inc.
 */

export const MIN_MARKET_CAP = 2_000_000_000;
export const MAX_UNIVERSE_SIZE = 800;

// FMP's >$2B US population is ~53% funds/ETFs, so we pull deep and filter down
// to real equities. ~1,400 real equities sit above $2B; 3000 covers them with
// headroom and still returns in a single screener call.
export const SCREENER_FETCH_LIMIT = 3000;

// Sanity floor for fetchUniverse: the real-equity population above $2B is
// ~1,400, so anything materially below this means the response is malformed or
// the criteria silently changed — abort rather than ship a truncated universe.
export const MIN_EXPECTED_TICKERS = 200;

// Major US exchanges we can reliably score on the FMP plan. The screener query
// already constrains exchange=NASDAQ,NYSE; this is defense-in-depth for rows
// that come back tagged with a venue we don't price.
export const ALLOWED_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
  "AMEX",
  "ARCA",
  "BATS",
  "CBOE",
]);

// Foreign/special listings carry characters we can't reliably score. The
// standard US class-share form (BRK-B, BF-B) uses a hyphen, which we keep.
const ODD_TICKER = /[^A-Z0-9.-]/;
const VALID_TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

import { assertNoFunds } from "./universe-guards";

const SCREENER_URL = "https://financialmodelingprep.com/stable/company-screener";

// Raw FMP /company-screener row. Every field is optional because we never
// trust the upstream shape — the filter validates what it needs.
export type ScreenerRow = {
  symbol?: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  beta?: number;
  price?: number;
  exchange?: string;
  exchangeShortName?: string;
  isEtf?: boolean;
  isFund?: boolean;
  isActivelyTrading?: boolean;
};

export type UniverseEntry = {
  symbol: string; // hyphenated class-share form (BRK-B), ready for FMP endpoints
  companyName: string;
  sector: string;
  marketCap: number;
  beta: number;
  price: number;
};

// FMP returns class shares as "BRK.B" / "BF.B"; FMP's score endpoints expect
// the hyphenated form ("BRK-B"). lib/scoring/fmp.ts does the same normalization
// for its own calls — mirror it here so every consumer agrees on the symbol.
export function normalizeSymbol(s: string): string {
  return s.trim().toUpperCase().replace(/\./g, "-");
}

// Mutual-fund share classes use a 5-letter ticker ending in X (AAFTX, ABALX,
// DFSVX). Verified to match none of the clean 800 real names — the only
// 5-letter tickers present are GOOGL, CMCSA, FWONK, … none ending in X — and
// being ticker-based it never touches a REIT/operating-company NAME.
const MUTUAL_FUND_TICKER = /^[A-Z]{4}X$/;

// ETF issuers brand their products in ways operating-company names don't.
// Deliberately narrow + specific (the generic Trust/Index/Strategy tokens are
// banned — they kill real REITs). Catches names like TQQQ "ProShares UltraPro
// QQQ" that FMP also mislabels isEtf=false.
const ETF_ISSUER_NAME =
  /\b(ProShares|Direxion|iShares|SPDR|VanEck|Global X|GraniteShares|Roundhill|Invesco QQQ)\b/i;

/**
 * Flag-independent fund/ETF detector. FMP's isEtf/isFund are necessary but not
 * sufficient (see the module header), so also reject the mutual-fund ticker
 * shape and a narrow ETF-issuer name list. Used by both selectUniverse and the
 * assertNoFunds guard so the filter and its tripwire can never disagree.
 */
export function looksLikeFundOrEtf(row: {
  symbol?: string;
  companyName?: string;
  isEtf?: boolean;
  isFund?: boolean;
}): boolean {
  if (row.isEtf || row.isFund) return true;
  const sym = normalizeSymbol(typeof row.symbol === "string" ? row.symbol : "");
  if (MUTUAL_FUND_TICKER.test(sym)) return true;
  const name = (row.companyName ?? "").trim();
  if (name && ETF_ISSUER_NAME.test(name)) return true;
  return false;
}

export type SelectOptions = {
  /** Hard cap on the returned universe, applied AFTER all exclusions. */
  maxSize: number;
  /** Minimum market cap; defaults to MIN_MARKET_CAP. */
  minMarketCap?: number;
  /** When true, drop rows that lack a sector (the stats corpus needs it). */
  requireSector?: boolean;
};

/**
 * Pure core: turn raw screener rows into the investable universe.
 *
 * Ordering matters. Every exclusion (fund/ETF type, bad ticker, sub-cap,
 * off-exchange, missing sector, duplicate) runs BEFORE the size cap, so we end
 * with `maxSize` real equities — not `maxSize` minus removals. Rows are sorted
 * by market cap desc first, so the cap keeps the largest names.
 */
export function selectUniverse(
  rows: readonly ScreenerRow[],
  opts: SelectOptions
): UniverseEntry[] {
  const minCap = opts.minMarketCap ?? MIN_MARKET_CAP;
  const sorted = [...rows].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  const seen = new Set<string>();
  const kept: UniverseEntry[] = [];
  for (const r of sorted) {
    // Root-cause type filter: exclude funds and ETFs. Flag-independent —
    // FMP's isEtf/isFund lie for mutual-fund share classes (see header).
    if (looksLikeFundOrEtf(r)) continue;

    const sym = normalizeSymbol(typeof r.symbol === "string" ? r.symbol : "");
    if (!sym || ODD_TICKER.test(sym) || !VALID_TICKER.test(sym)) continue;
    if ((r.marketCap ?? 0) < minCap) continue;

    const exch = r.exchangeShortName ?? r.exchange ?? "";
    if (exch && !ALLOWED_EXCHANGES.has(exch)) continue;

    const sector = (r.sector ?? "").trim();
    if (opts.requireSector && !sector) continue;

    if (seen.has(sym)) continue;
    seen.add(sym);

    kept.push({
      symbol: sym,
      companyName: (r.companyName ?? "").trim() || sym,
      sector,
      marketCap: r.marketCap ?? 0,
      beta: r.beta ?? 0,
      price: r.price ?? 0,
    });

    // Cap AFTER exclusions. Because `sorted` is market-cap desc, the first
    // maxSize survivors are exactly the top maxSize real equities.
    if (kept.length >= opts.maxSize) break;
  }
  return kept;
}

function buildScreenerUrl(apiKey: string, limit: number): string {
  const url = new URL(SCREENER_URL);
  url.searchParams.set("marketCapMoreThan", String(MIN_MARKET_CAP));
  url.searchParams.set("isActivelyTrading", "true");
  url.searchParams.set("country", "US");
  url.searchParams.set("exchange", "NASDAQ,NYSE");
  // Exclude funds/ETFs at the source. selectUniverse re-checks the row flags
  // as defense-in-depth in case the query param and row flags ever disagree.
  url.searchParams.set("isEtf", "false");
  url.searchParams.set("isFund", "false");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apikey", apiKey);
  return url.toString();
}

// Retry policy for the single screener call. It is the FIRST FMP request of
// every refresh run, so a transient burst 429 here used to kill the whole run
// and permanently lose the day's snapshot (2026-07-01, run 28577341746 — the
// same key succeeded an hour later). The pre-market window has hours of
// headroom, so waiting out a one-minute rate-limit burst is free insurance.
export type ScreenerRetryPolicy = {
  /** Total attempts, including the first. */
  attempts: number;
  /** Wait before retry N (1-indexed); the last entry repeats. */
  backoffMs: readonly number[];
  /** Per-attempt fetch timeout. */
  attemptTimeoutMs: number;
  /** Ceiling on any single wait, including server-sent Retry-After. */
  maxRetryAfterMs: number;
};

export const SCREENER_RETRY_DEFAULTS: ScreenerRetryPolicy = {
  attempts: 4,
  backoffMs: [30_000, 60_000, 120_000],
  attemptTimeoutMs: 25_000,
  maxRetryAfterMs: 180_000,
};

export type FetchUniverseOptions = {
  maxSize: number;
  minExpected?: number;
  requireSector?: boolean;
  fetchLimit?: number;
  /** Caller-level abort. Aborting it stops immediately — no further retries. */
  signal?: AbortSignal;
  /** Overrides for tests. */
  retry?: Partial<ScreenerRetryPolicy>;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
};

// Retry-After arrives as delta-seconds on FMP 429s. HTTP-date form is not
// worth parsing here — an unparseable header just falls back to the backoff.
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

// One screener request per attempt, each with its own timeout; 429/5xx and
// network errors retry with backoff, other HTTP errors and caller aborts
// throw immediately.
async function fetchScreenerWithRetry(
  url: string,
  opts: FetchUniverseOptions
): Promise<Response> {
  const policy: ScreenerRetryPolicy = { ...SCREENER_RETRY_DEFAULTS, ...opts.retry };
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep =
    opts.sleepImpl ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastFailure = "no attempt made";
  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new Error(
        `Company-screener aborted by caller before attempt ${attempt} (last: ${lastFailure}).`
      );
    }

    const ctrl = new AbortController();
    const onCallerAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), policy.attemptTimeoutMs);

    let res: Response | undefined;
    try {
      res = await doFetch(url, { signal: ctrl.signal });
    } catch (err) {
      // A caller abort must not be swallowed into the retry loop.
      if (opts.signal?.aborted) throw err;
      lastFailure = `attempt ${attempt}: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onCallerAbort);
    }

    if (res) {
      if (res.ok) return res;
      const body = await res.text().catch(() => "");
      lastFailure = `attempt ${attempt}: HTTP ${res.status}: ${body.slice(0, 200)}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) throw new Error(`Company-screener ${lastFailure}`);
    }

    if (attempt < policy.attempts) {
      const base =
        policy.backoffMs[Math.min(attempt - 1, policy.backoffMs.length - 1)] ?? 0;
      const retryAfter = res ? parseRetryAfterMs(res.headers.get("retry-after")) : undefined;
      await sleep(Math.min(Math.max(base, retryAfter ?? 0), policy.maxRetryAfterMs));
    }
  }

  throw new Error(
    `Company-screener failed after ${policy.attempts} attempts — last ${lastFailure}`
  );
}

/**
 * Resolve the universe live from FMP's company-screener: fetch → filter → cap,
 * with a sanity floor that aborts on a truncated/malformed response.
 */
export async function fetchUniverse(
  opts: FetchUniverseOptions
): Promise<UniverseEntry[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FMP_API_KEY is not set — required to resolve the screener universe. " +
        "Set it in .env locally or the GitHub Actions secret store."
    );
  }

  const url = buildScreenerUrl(apiKey, opts.fetchLimit ?? SCREENER_FETCH_LIMIT);
  const res = await fetchScreenerWithRetry(url, opts);

  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error(
      `Company-screener response was not an array (got ${typeof body}). ` +
        "FMP endpoint shape may have changed."
    );
  }

  const universe = selectUniverse(body as ScreenerRow[], {
    maxSize: opts.maxSize,
    requireSector: opts.requireSector,
  });

  const minExpected = opts.minExpected ?? MIN_EXPECTED_TICKERS;
  if (universe.length < minExpected) {
    throw new Error(
      `Only ${universe.length} real-equity tickers after filtering (expected ` +
        `≥${minExpected}). Screener shape or criteria may have changed; ` +
        "aborting rather than shipping a truncated universe."
    );
  }

  // Defense in depth: fail the build if any fund/ETF survived selectUniverse —
  // catches the case where FMP's isEtf/isFund query params and row-level flags
  // ever disagree. Tautological when they agree; cheap and decisive when not.
  assertNoFunds(universe, body as ScreenerRow[]);

  return universe;
}
