import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { settledCloseFromHistory, chooseLedgerPrice } from "./snapshot-price";
import type { PricePoint } from "./scoring/fmp";

const bar = (date: string, price: number): PricePoint => ({
  symbol: "TEST",
  date,
  price,
  volume: 1_000_000,
});

// History is newest-first (index 0 = latest settled EOD bar), matching FMP's
// /historical-price-eod/light ordering and the `slice(offset)` used in scoring.

test("settledCloseFromHistory: newest bar is the settled close; change vs prior bar", () => {
  const h = [bar("2026-06-18", 110), bar("2026-06-17", 100), bar("2026-06-16", 95)];
  const r = settledCloseFromHistory(h);
  strictEqual(r.date, "2026-06-18");
  strictEqual(r.close, 110);
  strictEqual(r.changePercent, 10); // (110-100)/100 * 100
});

test("settledCloseFromHistory: single bar → close set, changePercent null", () => {
  const r = settledCloseFromHistory([bar("2026-06-18", 110)]);
  strictEqual(r.close, 110);
  strictEqual(r.changePercent, null);
});

test("settledCloseFromHistory: empty history → all null", () => {
  const r = settledCloseFromHistory([]);
  strictEqual(r.date, null);
  strictEqual(r.close, null);
  strictEqual(r.changePercent, null);
});

test("settledCloseFromHistory: zero prior close → changePercent null (no divide-by-zero)", () => {
  const r = settledCloseFromHistory([bar("2026-06-18", 110), bar("2026-06-17", 0)]);
  strictEqual(r.close, 110);
  strictEqual(r.changePercent, null);
});

// chooseLedgerPrice: the ledger must record the SETTLED close for the labeled
// date. Use the settled EOD value only when its date matches the snapshot date
// (pre-market: prior close; after-close once the EOD bar publishes: today). If
// it doesn't match (e.g. after-close before the EOD bar is published), the live
// quote — which equals today's close while the market is shut — is correct.

test("chooseLedgerPrice: settled date matches snapshot date → uses settled close", () => {
  const r = chooseLedgerPrice({
    snapshotDate: "2026-06-18",
    settled: { date: "2026-06-18", close: 110, changePercent: 10 },
    livePrice: 111.3,
    liveChangePercent: 1.2,
  });
  strictEqual(r.price, 110);
  strictEqual(r.changePercent, 10);
  strictEqual(r.source, "settled");
});

test("chooseLedgerPrice: in-session contamination case — settled prior close wins over live intraday", () => {
  // The 2026-06-22 failure: run slips into the session, live quote is intraday,
  // snapshot is labeled with the prior close. Settled bar for the prior close
  // matches the label, so the ledger records the settled close, not intraday.
  const r = chooseLedgerPrice({
    snapshotDate: "2026-06-18",
    settled: { date: "2026-06-18", close: 110, changePercent: 10 },
    livePrice: 118.7, // live intraday spike
    liveChangePercent: 7.9,
  });
  strictEqual(r.price, 110);
  strictEqual(r.source, "settled");
});

test("chooseLedgerPrice: settled date stale (EOD bar not published yet) → falls back to live", () => {
  const r = chooseLedgerPrice({
    snapshotDate: "2026-06-18",
    settled: { date: "2026-06-17", close: 100, changePercent: 2 },
    livePrice: 110,
    liveChangePercent: 10,
  });
  strictEqual(r.price, 110);
  strictEqual(r.changePercent, 10);
  strictEqual(r.source, "live");
});

test("chooseLedgerPrice: no settled close → falls back to live", () => {
  const r = chooseLedgerPrice({
    snapshotDate: "2026-06-18",
    settled: { date: null, close: null, changePercent: null },
    livePrice: 110,
    liveChangePercent: 10,
  });
  strictEqual(r.price, 110);
  strictEqual(r.source, "live");
});

test("chooseLedgerPrice: settled close matches but changePercent null → keeps live changePercent", () => {
  const r = chooseLedgerPrice({
    snapshotDate: "2026-06-18",
    settled: { date: "2026-06-18", close: 110, changePercent: null },
    livePrice: 111,
    liveChangePercent: 3.3,
  });
  strictEqual(r.price, 110);
  strictEqual(r.changePercent, 3.3);
  strictEqual(r.source, "settled");
});
