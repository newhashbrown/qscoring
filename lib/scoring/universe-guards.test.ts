import { test } from "node:test";
import { throws, doesNotThrow, strictEqual } from "node:assert/strict";

import type { ScreenerRow, UniverseEntry } from "./universe";
import {
  assertNoFunds,
  assertSectorConcentration,
  assertFundamentalsCoverage,
  sectorCounts,
  MAX_SECTOR_SHARE,
  MIN_FUNDAMENTALS_COVERAGE,
} from "./universe-guards";

function entry(over: Partial<UniverseEntry> = {}): UniverseEntry {
  return { symbol: "AAPL", companyName: "Apple", sector: "Technology", marketCap: 1, beta: 1, price: 1, ...over };
}

test("assertNoFunds: throws when a flagged fund slips into the universe", () => {
  const universe = [entry({ symbol: "JMUEX", companyName: "JPMorgan U.S. Equity Fund", sector: "Financial Services" })];
  const raw: ScreenerRow[] = [{ symbol: "JMUEX", isFund: true }];
  throws(() => assertNoFunds(universe, raw), /fund\/ETF/);
});

test("assertNoFunds: throws on an ETF, naming the offender", () => {
  const universe = [entry({ symbol: "ACWI" }), entry({ symbol: "AAPL" })];
  const raw: ScreenerRow[] = [{ symbol: "ACWI", isEtf: true }, { symbol: "AAPL", isEtf: false }];
  throws(() => assertNoFunds(universe, raw), /ACWI/);
});

test("assertNoFunds: catches a mutual fund FMP mislabels isFund=false (2026-06-23 regression)", () => {
  // The flag-trusting version missed this: AAFTX returned isFund=false.
  const universe = [
    entry({ symbol: "AAFTX", companyName: "American Funds 2050 Target Date" }),
    entry({ symbol: "AAPL" }),
  ];
  const raw: ScreenerRow[] = [
    { symbol: "AAFTX", isFund: false, isEtf: false },
    { symbol: "AAPL", isFund: false, isEtf: false },
  ];
  throws(() => assertNoFunds(universe, raw), /AAFTX/);
});

test("assertNoFunds: catches an ETF-issuer name when FMP isEtf is false (TQQQ)", () => {
  const universe = [entry({ symbol: "TQQQ", companyName: "ProShares UltraPro QQQ" })];
  const raw: ScreenerRow[] = [{ symbol: "TQQQ", isEtf: false, isFund: false }];
  throws(() => assertNoFunds(universe, raw), /fund\/ETF/);
});

test("assertNoFunds: passes a clean universe", () => {
  const universe = [entry({ symbol: "AAPL" }), entry({ symbol: "MSFT" })];
  const raw: ScreenerRow[] = [
    { symbol: "AAPL", isEtf: false, isFund: false },
    { symbol: "MSFT", isEtf: false, isFund: false },
  ];
  doesNotThrow(() => assertNoFunds(universe, raw));
});

test("assertNoFunds: matches dotted-vs-hyphenated class shares", () => {
  const universe = [entry({ symbol: "BRK-B" })];
  const raw: ScreenerRow[] = [{ symbol: "BRK.B", isFund: false }];
  doesNotThrow(() => assertNoFunds(universe, raw));
});

test("assertSectorConcentration: fails the 60% contamination", () => {
  throws(
    () => assertSectorConcentration({ "Financial Services": 481, Technology: 76 }, 800),
    /concentration too high/
  );
});

test("assertSectorConcentration: passes a clean distribution", () => {
  doesNotThrow(() =>
    assertSectorConcentration({ "Financial Services": 124, Technology: 138, Industrials: 133 }, 800)
  );
});

test("assertSectorConcentration: throws on an empty universe", () => {
  throws(() => assertSectorConcentration({}, 0), /empty universe/);
});

test("assertSectorConcentration: boundary — exactly at the ceiling passes", () => {
  const total = 100;
  const atCeiling = Math.floor(MAX_SECTOR_SHARE * total); // 30 → 30% == ceiling, not over
  doesNotThrow(() => assertSectorConcentration({ X: atCeiling }, total));
  throws(() => assertSectorConcentration({ X: atCeiling + 1 }, total), /too high/);
});

test("assertFundamentalsCoverage: fails 49% coverage, passes 95%", () => {
  throws(() => assertFundamentalsCoverage(392, 800), /coverage too low/);
  doesNotThrow(() => assertFundamentalsCoverage(760, 800));
});

test("assertFundamentalsCoverage: boundary at the floor passes", () => {
  const total = 1000;
  const atFloor = Math.ceil(MIN_FUNDAMENTALS_COVERAGE * total); // 900
  doesNotThrow(() => assertFundamentalsCoverage(atFloor, total));
  throws(() => assertFundamentalsCoverage(atFloor - 1, total), /too low/);
});

test("sectorCounts: tallies and buckets missing sectors as Unknown", () => {
  const counts = sectorCounts([{ sector: "Technology" }, { sector: "Technology" }, { sector: "" }, {}]);
  strictEqual(counts.Technology, 2);
  strictEqual(counts.Unknown, 2);
});
