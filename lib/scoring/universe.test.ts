import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { selectUniverse, normalizeSymbol, type ScreenerRow } from "./universe";

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
