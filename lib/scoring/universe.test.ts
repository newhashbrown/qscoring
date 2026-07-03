import { test } from "node:test";
import { strictEqual, deepStrictEqual, rejects, match } from "node:assert/strict";
import {
  selectUniverse,
  normalizeSymbol,
  fetchUniverse,
  SCREENER_RETRY_DEFAULTS,
  type ScreenerRow,
} from "./universe";

function row(over: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    symbol: "TEST",
    companyName: "Test Co",
    sector: "Technology",
    marketCap: 5_000_000_000,
    exchangeShortName: "NASDAQ",
    isEtf: false,
    isFund: false,
    isActivelyTrading: true,
    ...over,
  };
}

test("selectUniverse: excludes funds and ETFs (the root-cause filter)", () => {
  const rows = [
    row({ symbol: "AAPL" }),
    row({ symbol: "SPY", isEtf: true }),
    row({ symbol: "AGTHX", isFund: true }),
  ];
  const u = selectUniverse(rows, { maxSize: 10 });
  deepStrictEqual(u.map((e) => e.symbol), ["AAPL"]);
});

test("selectUniverse: caps to maxSize AFTER exclusions, keeping the largest", () => {
  const rows = [
    row({ symbol: "SMALL", marketCap: 2_100_000_000 }),
    row({ symbol: "FUND", isFund: true, marketCap: 9_000_000_000 }),
    row({ symbol: "BIG", marketCap: 8_000_000_000 }),
    row({ symbol: "MID", marketCap: 5_000_000_000 }),
  ];
  // maxSize 2 → top-2 REAL equities by cap (FUND excluded before the cap).
  const u = selectUniverse(rows, { maxSize: 2 });
  deepStrictEqual(u.map((e) => e.symbol), ["BIG", "MID"]);
});

test("selectUniverse: excludes mutual funds / ETFs FMP mislabels isFund=false (2026-06-23 regression)", () => {
  // These returned isFund=false isEtf=false exchange=NASDAQ and contaminated
  // the universe. Caught now by the ticker shape (…X) and ETF-issuer name.
  const rows = [
    row({ symbol: "AAPL" }),
    row({ symbol: "AAFTX", companyName: "American Funds 2050 Target Date", isFund: false, isEtf: false }),
    row({ symbol: "DFSVX", companyName: "DFA U.S. Small Cap Value Portfolio", isFund: false, isEtf: false }),
    row({ symbol: "TQQQ", companyName: "ProShares UltraPro QQQ", isEtf: false, isFund: false }),
  ];
  deepStrictEqual(selectUniverse(rows, { maxSize: 10 }).map((e) => e.symbol), ["AAPL"]);
});

test("selectUniverse: the fund filters do NOT catch real names (REITs, class shares, 5-letter non-X)", () => {
  const rows = [
    row({ symbol: "GOOGL" }),
    row({ symbol: "CMCSA" }),
    row({ symbol: "BRK.B", companyName: "Berkshire Hathaway" }),
    row({ symbol: "DLR", companyName: "Digital Realty Trust, Inc.", sector: "Real Estate" }),
    row({ symbol: "FRT", companyName: "Federal Realty Investment Trust", sector: "Real Estate" }),
  ];
  deepStrictEqual(
    selectUniverse(rows, { maxSize: 10 }).map((e) => e.symbol).sort(),
    ["BRK-B", "CMCSA", "DLR", "FRT", "GOOGL"]
  );
});

test("selectUniverse: excludes sub-cap names", () => {
  const u = selectUniverse(
    [row({ symbol: "BIG", marketCap: 5e9 }), row({ symbol: "TINY", marketCap: 1e9 })],
    { maxSize: 10, minMarketCap: 2e9 }
  );
  deepStrictEqual(u.map((e) => e.symbol), ["BIG"]);
});

test("selectUniverse: excludes names on a non-allowed exchange", () => {
  const u = selectUniverse(
    [row({ symbol: "OK", exchangeShortName: "NYSE" }), row({ symbol: "OTC", exchangeShortName: "PINK" })],
    { maxSize: 10 }
  );
  deepStrictEqual(u.map((e) => e.symbol), ["OK"]);
});

test("selectUniverse: requireSector drops rows without a sector", () => {
  const rows = [row({ symbol: "HASSEC" }), row({ symbol: "NOSEC", sector: "" })];
  strictEqual(selectUniverse(rows, { maxSize: 10, requireSector: true }).length, 1);
  strictEqual(selectUniverse(rows, { maxSize: 10 }).length, 2); // allowed when not required
});

test("selectUniverse: normalizes dotted class shares and dedups", () => {
  const rows = [
    row({ symbol: "BRK.B", marketCap: 9e11 }),
    row({ symbol: "BRK-B", marketCap: 9e11 }), // same after normalization → one entry
  ];
  const u = selectUniverse(rows, { maxSize: 10 });
  deepStrictEqual(u.map((e) => e.symbol), ["BRK-B"]);
  strictEqual(normalizeSymbol("BRK.B"), "BRK-B");
});

test("selectUniverse: rejects malformed tickers", () => {
  const u = selectUniverse(
    [row({ symbol: "GOOD" }), row({ symbol: "BAD$YM" }), row({ symbol: "" })],
    { maxSize: 10 }
  );
  deepStrictEqual(u.map((e) => e.symbol), ["GOOD"]);
});

// ---- fetchUniverse retry behavior ------------------------------------------
// fetchUniverse makes ONE screener call at the very start of every refresh
// run. On 2026-07-02 a transient FMP burst 429 on that single unretried call
// killed the pre-market run and lost the 2026-07-01 snapshot permanently
// (run 28577341746) — the same key succeeded an hour later. These tests drive
// the retry loop through injected fetchImpl/sleepImpl so no real network or
// clock is involved.

process.env.FMP_API_KEY = process.env.FMP_API_KEY || "test-key";

const SCREENER_BODY = [row({ symbol: "AAPL" }), row({ symbol: "MSFT" })];

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function scriptedFetch(responses: Array<() => Response | Error>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    // Past the end of the script, keep replaying the last response.
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    const out = next();
    if (out instanceof Error) throw out;
    return out;
  }) as typeof fetch;
  return { impl, calls };
}

function recordedSleep() {
  const waits: number[] = [];
  const sleepImpl = async (ms: number) => {
    waits.push(ms);
  };
  return { waits, sleepImpl };
}

const RETRY_OPTS = { maxSize: 10, minExpected: 1 } as const;

test("fetchUniverse: retries a burst 429 and succeeds (2026-07-01 snapshot loss)", async () => {
  const { impl, calls } = scriptedFetch([
    () => jsonResponse(429, { "Error Message": "Limit Reach ." }),
    () => jsonResponse(200, SCREENER_BODY),
  ]);
  const { waits, sleepImpl } = recordedSleep();
  const u = await fetchUniverse({ ...RETRY_OPTS, fetchImpl: impl, sleepImpl });
  deepStrictEqual(u.map((e) => e.symbol).sort(), ["AAPL", "MSFT"]);
  strictEqual(calls.length, 2);
  deepStrictEqual(waits, [SCREENER_RETRY_DEFAULTS.backoffMs[0]]);
});

test("fetchUniverse: retries 5xx and network errors, then succeeds", async () => {
  const { impl, calls } = scriptedFetch([
    () => jsonResponse(503, "upstream unavailable"),
    () => new TypeError("fetch failed"),
    () => jsonResponse(200, SCREENER_BODY),
  ]);
  const { waits, sleepImpl } = recordedSleep();
  const u = await fetchUniverse({ ...RETRY_OPTS, fetchImpl: impl, sleepImpl });
  strictEqual(u.length, 2);
  strictEqual(calls.length, 3);
  strictEqual(waits.length, 2);
});

test("fetchUniverse: honors Retry-After when longer than the base backoff", async () => {
  const { impl } = scriptedFetch([
    () => jsonResponse(429, {}, { "retry-after": "90" }),
    () => jsonResponse(200, SCREENER_BODY),
  ]);
  const { waits, sleepImpl } = recordedSleep();
  await fetchUniverse({ ...RETRY_OPTS, fetchImpl: impl, sleepImpl });
  deepStrictEqual(waits, [90_000]);
});

test("fetchUniverse: caps Retry-After at maxRetryAfterMs", async () => {
  const { impl } = scriptedFetch([
    () => jsonResponse(429, {}, { "retry-after": "3600" }),
    () => jsonResponse(200, SCREENER_BODY),
  ]);
  const { waits, sleepImpl } = recordedSleep();
  await fetchUniverse({ ...RETRY_OPTS, fetchImpl: impl, sleepImpl });
  deepStrictEqual(waits, [SCREENER_RETRY_DEFAULTS.maxRetryAfterMs]);
});

test("fetchUniverse: gives up after the attempt budget and reports the last error", async () => {
  const { impl, calls } = scriptedFetch([
    () => jsonResponse(429, { "Error Message": "Limit Reach ." }),
  ]);
  const { waits, sleepImpl } = recordedSleep();
  await rejects(
    fetchUniverse({ ...RETRY_OPTS, fetchImpl: impl, sleepImpl }),
    (err: Error) => {
      match(err.message, /429/);
      match(err.message, new RegExp(`${SCREENER_RETRY_DEFAULTS.attempts} attempts`));
      return true;
    }
  );
  strictEqual(calls.length, SCREENER_RETRY_DEFAULTS.attempts);
  strictEqual(waits.length, SCREENER_RETRY_DEFAULTS.attempts - 1);
});

test("fetchUniverse: does NOT retry non-retryable client errors (bad key)", async () => {
  const { impl, calls } = scriptedFetch([
    () => jsonResponse(401, { "Error Message": "Invalid API KEY." }),
  ]);
  const { waits, sleepImpl } = recordedSleep();
  await rejects(
    fetchUniverse({ ...RETRY_OPTS, fetchImpl: impl, sleepImpl }),
    /401/
  );
  strictEqual(calls.length, 1);
  strictEqual(waits.length, 0);
});

test("fetchUniverse: a caller abort is not retried", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const { impl, calls } = scriptedFetch([() => jsonResponse(200, SCREENER_BODY)]);
  const { waits, sleepImpl } = recordedSleep();
  await rejects(
    fetchUniverse({ ...RETRY_OPTS, signal: ctrl.signal, fetchImpl: impl, sleepImpl })
  );
  strictEqual(calls.length, 0);
  strictEqual(waits.length, 0);
});

test("selectUniverse: keeps real REITs and '…Trust' equities (no name heuristic)", () => {
  // Regression guard against trading the fund-contamination bug for an
  // exclusion bug: these are real large-caps whose names match the sitemap's
  // derivative regex. The scored universe must filter on isEtf/isFund flags
  // ONLY, never on the company name.
  const rows = [
    row({ symbol: "DLR", companyName: "Digital Realty Trust, Inc.", sector: "Real Estate" }),
    row({ symbol: "FRT", companyName: "Federal Realty Investment Trust", sector: "Real Estate" }),
    row({ symbol: "MSTR", companyName: "Strategy Inc", sector: "Technology" }),
    row({ symbol: "NTRS", companyName: "Northern Trust Corporation", sector: "Financial Services" }),
  ];
  const u = selectUniverse(rows, { maxSize: 100 });
  deepStrictEqual(u.map((e) => e.symbol).sort(), ["DLR", "FRT", "MSTR", "NTRS"]);
});
