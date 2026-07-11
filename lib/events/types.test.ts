import { test } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert/strict";
import {
  mapEarnings,
  mapDividends,
  mapSplits,
  filterUpcoming,
  isValidEventRow,
  splitRatio,
  type TickerEvent,
} from "./types";

test("mapEarnings: maps symbol/date + estimates, skips rows missing symbol or date", () => {
  const out = mapEarnings([
    { symbol: "AAPL", date: "2026-08-01", epsEstimated: 1.42, revenueEstimated: 9.4e10 },
    { symbol: "MSFT", date: "2026-07-29 16:00:00" }, // datetime → date part kept
    { date: "2026-08-05" }, // no symbol → skip
    { symbol: "NVDA" }, // no date → skip
  ]);
  strictEqual(out.length, 2);
  strictEqual(out[0].ticker, "AAPL");
  strictEqual(out[0].eventDate, "2026-08-01");
  deepStrictEqual(out[0].details, { epsEstimated: 1.42, revenueEstimated: 9.4e10 });
  strictEqual(out[1].eventDate, "2026-07-29"); // truncated from datetime
});

test("mapDividends: ex-dividend date is the row date; carries amount + payment date", () => {
  const out = mapDividends([
    { symbol: "AAPL", date: "2026-08-09", dividend: 0.25, paymentDate: "2026-08-14" },
    { symbol: "ko", date: "2026-08-15", adjDividend: 0.48 }, // falls back to adjDividend; lowercase symbol
  ]);
  strictEqual(out.length, 2);
  strictEqual(out[0].eventType, "ex_dividend");
  deepStrictEqual(out[0].details, { dividend: 0.25, paymentDate: "2026-08-14" });
  strictEqual(out[1].ticker, "KO");
  deepStrictEqual(out[1].details, { dividend: 0.48, paymentDate: null });
});

test("mapSplits: carries numerator/denominator", () => {
  const out = mapSplits([{ symbol: "NVDA", date: "2026-08-15", numerator: 4, denominator: 1 }]);
  strictEqual(out.length, 1);
  strictEqual(out[0].eventType, "split");
  strictEqual(splitRatio(out[0].details as { numerator: number; denominator: number }), "4:1");
});

test("splitRatio: null when incomplete", () => {
  strictEqual(splitRatio({ numerator: null, denominator: 1 }), null);
  strictEqual(splitRatio({ numerator: 3, denominator: null }), null);
});

test("filterUpcoming: keeps in-universe events on/after asOf, drops past + off-universe", () => {
  const universe = new Set(["AAPL", "MSFT"]);
  const events: TickerEvent[] = [
    { ticker: "AAPL", eventType: "earnings", eventDate: "2026-08-01", details: { epsEstimated: null, revenueEstimated: null } },
    { ticker: "AAPL", eventType: "earnings", eventDate: "2026-05-01", details: { epsEstimated: null, revenueEstimated: null } }, // past
    { ticker: "TSLA", eventType: "earnings", eventDate: "2026-08-01", details: { epsEstimated: null, revenueEstimated: null } }, // off-universe
    { ticker: "MSFT", eventType: "split", eventDate: "2026-07-10", details: { numerator: 2, denominator: 1 } }, // == asOf, kept
  ];
  const kept = filterUpcoming(events, universe, "2026-07-10");
  strictEqual(kept.length, 2);
  ok(kept.every((e) => e.ticker === "AAPL" || e.ticker === "MSFT"));
  ok(kept.every((e) => e.eventDate >= "2026-07-10"));
});

test("isValidEventRow: accepts good rows, rejects bad type/date/ticker", () => {
  strictEqual(isValidEventRow({ ticker: "AAPL", eventType: "earnings", eventDate: "2026-08-01" }), true);
  strictEqual(isValidEventRow({ ticker: "AAPL", eventType: "buyback", eventDate: "2026-08-01" }), false);
  strictEqual(isValidEventRow({ ticker: "AAPL", eventType: "split", eventDate: "not-a-date" }), false);
  strictEqual(isValidEventRow({ ticker: "", eventType: "split", eventDate: "2026-08-01" }), false);
});
