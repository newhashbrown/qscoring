import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { isUsTradingDay } from "./market-date";

test("isUsTradingDay: weekday in ET → true", () => {
  strictEqual(isUsTradingDay(new Date("2026-05-15T11:32:00Z")), true); // Fri ~07:32 ET
  strictEqual(isUsTradingDay(new Date("2026-05-18T12:50:00Z")), true); // Mon ~08:50 ET
  strictEqual(isUsTradingDay(new Date("2026-05-19T12:24:00Z")), true); // Tue ~08:24 ET
});

test("isUsTradingDay: Saturday in ET → false", () => {
  strictEqual(isUsTradingDay(new Date("2026-05-16T10:44:00Z")), false); // Sat ~06:44 ET
});

test("isUsTradingDay: Sunday in ET → false", () => {
  strictEqual(isUsTradingDay(new Date("2026-05-17T10:51:00Z")), false); // Sun ~06:51 ET
});

test("isUsTradingDay: UTC-vs-ET day boundary respects ET wall clock", () => {
  // Sat 01:00 UTC is Fri 21:00 ET → still a trading day in ET.
  strictEqual(isUsTradingDay(new Date("2026-05-16T01:00:00Z")), true);
  // Mon 03:00 UTC is Sun 23:00 ET → still a non-trading day in ET.
  strictEqual(isUsTradingDay(new Date("2026-05-18T03:00:00Z")), false);
});
