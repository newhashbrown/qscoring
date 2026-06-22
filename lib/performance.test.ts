import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { tradingDaysBetween } from "./performance";

// tradingDaysBetween counts actual US trading days in (start, end] — ET
// weekdays minus NYSE holidays (issue #48). 2026-06-22 is a Monday.

test("tradingDaysBetween: a holiday-free week counts five trading days", () => {
  // (06-08 Mon, 06-15 Mon]: Tue..Fri + the closing Mon = 5.
  strictEqual(tradingDaysBetween("2026-06-08", "2026-06-15"), 5);
});

test("tradingDaysBetween: the Juneteenth week drops the holiday", () => {
  // (06-15 Mon, 06-22 Mon]: Tue16, Wed17, Thu18, [Fri19 Juneteenth skipped],
  // Sat/Sun, Mon22 = 4. The old 5/7 approximation returned 5.
  strictEqual(tradingDaysBetween("2026-06-15", "2026-06-22"), 4);
});

test("tradingDaysBetween: the Memorial Day week drops the holiday", () => {
  // (05-22 Fri, 05-29 Fri]: Sat/Sun, [Mon25 Memorial skipped], Tue..Fri = 4.
  strictEqual(tradingDaysBetween("2026-05-22", "2026-05-29"), 4);
});

test("tradingDaysBetween: zero for equal or reversed dates", () => {
  strictEqual(tradingDaysBetween("2026-06-22", "2026-06-22"), 0);
  strictEqual(tradingDaysBetween("2026-06-22", "2026-06-19"), 0);
});
