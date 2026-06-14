import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import {
  sizeBucket,
  avgDollarVolume,
  parse52WeekRange,
  buildCompanyHeader,
} from "./company-header";
import type { PricePoint } from "./fmp";

function bar(price: number, volume: number): PricePoint {
  return { symbol: "TEST", date: "2026-01-01", price, volume };
}

// ─── sizeBucket ──────────────────────────────────────────────
test("sizeBucket: classifies each tier by conventional cap floors", () => {
  strictEqual(sizeBucket(250_000_000_000), "mega");
  strictEqual(sizeBucket(50_000_000_000), "large");
  strictEqual(sizeBucket(5_000_000_000), "mid");
  strictEqual(sizeBucket(800_000_000), "small");
  strictEqual(sizeBucket(100_000_000), "micro");
});

test("sizeBucket: lower bound is inclusive (sits in the larger bucket)", () => {
  strictEqual(sizeBucket(200_000_000_000), "mega");
  strictEqual(sizeBucket(10_000_000_000), "large");
  strictEqual(sizeBucket(2_000_000_000), "mid");
  strictEqual(sizeBucket(300_000_000), "small");
});

test("sizeBucket: null / non-finite / negative → null", () => {
  strictEqual(sizeBucket(null), null);
  strictEqual(sizeBucket(undefined), null);
  strictEqual(sizeBucket(NaN), null);
  strictEqual(sizeBucket(Infinity), null); // non-finite is rejected before bucketing
  strictEqual(sizeBucket(-1), null);
});

// ─── avgDollarVolume ─────────────────────────────────────────
test("avgDollarVolume: averages price × volume over the window", () => {
  // 3 bars: $10×100=1000, $20×200=4000, $30×100=3000 → mean 2666.67
  const hist = [bar(10, 100), bar(20, 200), bar(30, 100)];
  const avg = avgDollarVolume(hist, 20);
  strictEqual(avg !== null && Math.abs(avg - 2666.6667) < 0.01, true);
});

test("avgDollarVolume: only counts the most-recent `days` bars", () => {
  // window=2 takes the first two (most-recent-first ordering): 1000, 4000 → 2500
  const hist = [bar(10, 100), bar(20, 200), bar(30, 100)];
  strictEqual(avgDollarVolume(hist, 2), 2500);
});

test("avgDollarVolume: skips non-finite / non-positive bars, not poisons the mean", () => {
  const hist = [bar(10, 100), bar(NaN, 200), bar(20, 0), bar(30, 100)];
  // valid: 1000 and 3000 → mean 2000
  strictEqual(avgDollarVolume(hist, 20), 2000);
});

test("avgDollarVolume: empty / all-invalid → null", () => {
  strictEqual(avgDollarVolume([], 20), null);
  strictEqual(avgDollarVolume(null, 20), null);
  strictEqual(avgDollarVolume([bar(0, 0), bar(-1, 5)], 20), null);
});

// ─── parse52WeekRange ────────────────────────────────────────
test("parse52WeekRange: splits FMP range string into low/high", () => {
  deepStrictEqual(parse52WeekRange("195.07-317.4"), { low: 195.07, high: 317.4 });
});

test("parse52WeekRange: malformed / empty / inverted → null", () => {
  strictEqual(parse52WeekRange(""), null);
  strictEqual(parse52WeekRange(null), null);
  strictEqual(parse52WeekRange("abc"), null);
  strictEqual(parse52WeekRange("100"), null);
  strictEqual(parse52WeekRange("300-100"), null); // high < low
});

// ─── buildCompanyHeader ──────────────────────────────────────
test("buildCompanyHeader: assembles full header from payload fields", () => {
  const header = buildCompanyHeader({
    marketCap: 4_275_929_952_280,
    sharesOutstanding: 14_687_356_000,
    floatShares: 14_662_534_368,
    freeFloatPercent: 99.83,
    dividendYield: 0.0042,
    range52Week: "195.07-317.4",
    history: [bar(290, 40_000_000), bar(285, 50_000_000)],
  });
  strictEqual(header.sizeBucket, "mega");
  strictEqual(header.week52High, 317.4);
  strictEqual(header.week52Low, 195.07);
  strictEqual(header.sharesOutstanding, 14_687_356_000);
  strictEqual(header.dividendYield, 0.0042);
  // (290×40M + 285×50M) / 2 = (11.6e9 + 14.25e9)/2 = 12.925e9
  strictEqual(header.avgDollarVolume20, 12_925_000_000);
});

test("buildCompanyHeader: missing inputs degrade to null, not throw", () => {
  const header = buildCompanyHeader({
    marketCap: null,
    sharesOutstanding: undefined,
    floatShares: null,
    freeFloatPercent: null,
    dividendYield: null,
    range52Week: undefined,
    history: null,
  });
  strictEqual(header.sizeBucket, null);
  strictEqual(header.marketCap, null);
  strictEqual(header.week52High, null);
  strictEqual(header.avgDollarVolume20, null);
});
