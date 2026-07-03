import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { asOfLedgerPrice, rebuildSnapshotPicks, type EodBar } from "./snapshot-rebuild";

// The deliberate as-of rebuild of a lost snapshot day (2026-07-01, killed by
// a transient screener 429) must reproduce exactly what chooseLedgerPrice
// would have frozen pre-market: the target date's settled close, and the
// change vs the PRIOR trading day's close — never anything after the target.

const bars: EodBar[] = [
  { date: "2026-07-02", close: 105 }, // exists in history at rebuild time — must be invisible
  { date: "2026-07-01", close: 102 },
  { date: "2026-06-30", close: 100 },
  { date: "2026-06-29", close: 98 },
];

test("asOfLedgerPrice: freezes the target-date close and change vs prior bar", () => {
  const l = asOfLedgerPrice(bars, "2026-07-01");
  deepStrictEqual(l, { price: 102, changePercent: 2 });
});

test("asOfLedgerPrice: bars after the target date never leak in (no look-ahead)", () => {
  // Same history, target 06-30: the 07-01 and 07-02 bars must be ignored.
  const l = asOfLedgerPrice(bars, "2026-06-30");
  deepStrictEqual(l, { price: 100, changePercent: (100 - 98) / 98 * 100 });
});

test("asOfLedgerPrice: null when the target date has no bar (halted/delisted)", () => {
  strictEqual(asOfLedgerPrice(bars, "2026-07-03"), null);
  strictEqual(
    asOfLedgerPrice([{ date: "2026-06-30", close: 100 }], "2026-07-01"),
    null
  );
});

test("asOfLedgerPrice: null changePercent when no prior bar exists (new listing)", () => {
  const l = asOfLedgerPrice([{ date: "2026-07-01", close: 50 }], "2026-07-01");
  deepStrictEqual(l, { price: 50, changePercent: null });
});

test("asOfLedgerPrice: tolerates unsorted history and junk closes", () => {
  const messy: EodBar[] = [
    { date: "2026-06-30", close: 100 },
    { date: "2026-07-01", close: Number.NaN },
    { date: "2026-07-01", close: 102 },
    { date: "2026-06-29", close: 0 }, // zero close = junk, must not become the prior
  ];
  deepStrictEqual(asOfLedgerPrice(messy, "2026-07-01"), {
    price: 102,
    changePercent: 2,
  });
});

function pick(ticker: string, over: Record<string, unknown> = {}) {
  return {
    ticker,
    companyName: `${ticker} Inc`,
    price: 999, // stale source-day price — must be overridden
    changePercent: -9.9, // stale source-day change — must be overridden
    composite: 71,
    signal: "HOLD",
    confidence: "MEDIUM",
    longTermScore: 70,
    shortTermScore: 72,
    categories: [{ name: "value", label: "Value", score: 60 }],
    ...over,
  };
}

test("rebuildSnapshotPicks: overrides ONLY price/changePercent, preserves scores", () => {
  const ledger = new Map([
    ["AAPL", { price: 102, changePercent: 2 }],
    ["MSFT", { price: 300, changePercent: -1.5 }],
  ]);
  const { picks, missing } = rebuildSnapshotPicks([pick("MSFT"), pick("AAPL")], ledger);
  deepStrictEqual(missing, []);
  // Sorted by ticker, like every scoreboard/snapshot the daily build writes.
  deepStrictEqual(picks.map((p) => p.ticker), ["AAPL", "MSFT"]);
  strictEqual(picks[0].price, 102);
  strictEqual(picks[0].changePercent, 2);
  strictEqual(picks[0].composite, 71); // carried forward untouched
  strictEqual(picks[0].signal, "HOLD");
  strictEqual(picks[1].price, 300);
});

test("rebuildSnapshotPicks: drops tickers without a target bar or prior bar", () => {
  const ledger = new Map([
    ["AAPL", { price: 102, changePercent: 2 }],
    ["NEWCO", { price: 50, changePercent: null }], // listed on target day — no honest change
  ]);
  const { picks, missing } = rebuildSnapshotPicks(
    [pick("AAPL"), pick("GONE"), pick("NEWCO")],
    ledger
  );
  deepStrictEqual(picks.map((p) => p.ticker), ["AAPL"]);
  deepStrictEqual(missing, [
    { ticker: "GONE", reason: "no-target-bar" },
    { ticker: "NEWCO", reason: "no-prior-bar" },
  ]);
});

test("rebuildSnapshotPicks: does not mutate the source picks", () => {
  const src = [pick("AAPL")];
  rebuildSnapshotPicks(src, new Map([["AAPL", { price: 102, changePercent: 2 }]]));
  strictEqual(src[0].price, 999);
  strictEqual(src[0].changePercent, -9.9);
});
