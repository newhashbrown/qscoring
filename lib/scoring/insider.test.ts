import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { summarizeInsider } from "./insider";
import type { InsiderTrade } from "./fmp";

const NOW = new Date("2026-06-16T00:00:00Z");

function trade(date: string, type: string, ad: string, shares: number, price: number): InsiderTrade {
  return {
    symbol: "X", transactionDate: date, transactionType: type,
    acquisitionOrDisposition: ad, securitiesTransacted: shares, price,
  };
}

test("summarizeInsider: nets open-market buys vs sells", () => {
  const s = summarizeInsider(
    [
      trade("2026-06-01", "P-Purchase", "A", 1000, 100), // +100k
      trade("2026-05-15", "S-Sale", "D", 400, 100), // −40k
    ],
    NOW,
    180
  )!;
  strictEqual(s.buyCount, 1);
  strictEqual(s.sellCount, 1);
  strictEqual(s.netShares, 600);
  strictEqual(s.netValue, 60000);
  strictEqual(s.direction, "net-buying");
});

test("summarizeInsider: excludes awards/option exercises and out-of-window trades", () => {
  const s = summarizeInsider(
    [
      trade("2026-06-01", "A-Award", "A", 5000, 100), // award — excluded
      trade("2026-06-01", "M-Exempt", "A", 5000, 100), // option exercise — excluded
      trade("2026-06-01", "S-Sale", "D", 200, 100), // counted
      trade("2025-01-01", "P-Purchase", "A", 9999, 100), // outside 180d — excluded
    ],
    NOW,
    180
  )!;
  strictEqual(s.buyCount, 0);
  strictEqual(s.sellCount, 1);
  strictEqual(s.direction, "net-selling");
});

test("summarizeInsider: no qualifying trades → null", () => {
  strictEqual(summarizeInsider([trade("2026-06-01", "A-Award", "A", 1, 1)], NOW, 180), null);
  strictEqual(summarizeInsider([], NOW, 180), null);
});
