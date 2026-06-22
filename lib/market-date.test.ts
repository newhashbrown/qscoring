import { test } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import {
  isNyseHoliday,
  isRegularSessionOpen,
  isUsTradingDay,
  marketCloseDate,
  NYSE_HOLIDAY_TABLE_THROUGH,
  recoveryCloseDate,
} from "./market-date";

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

// --- recoveryCloseDate: the 18:00 UTC recovery detector, delay-invariant ---
// 2026-06-08 Mon, 06-09 Tue, 06-10 Wed; 06-05 Fri.

test("recoveryCloseDate: 2026-06-10 incident — late 18:00 cron still targets prior close", () => {
  // The 18:00 UTC detector fired at 20:37 UTC = 16:37 ET (GitHub delay),
  // which crossed the 16:00 ET boundary and made marketCloseDate roll the
  // target FORWARD to the not-yet-due 2026-06-10. Recovery must clamp back.
  strictEqual(recoveryCloseDate("2026-06-10T20:37:46Z"), "2026-06-09");
  // For contrast, the raw build mapping is exactly what false-failed:
  strictEqual(marketCloseDate("2026-06-10T20:37:46Z"), "2026-06-10");
});

test("recoveryCloseDate: on-time 18:00 UTC (14:00 ET) is unchanged vs marketCloseDate", () => {
  // ET hour 14 < 16 → no clamp needed; both target the prior session.
  strictEqual(recoveryCloseDate("2026-06-10T18:00:00Z"), "2026-06-09");
  strictEqual(marketCloseDate("2026-06-10T18:00:00Z"), "2026-06-09");
});

test("recoveryCloseDate: no-op for any pre-16:00-ET timestamp", () => {
  // Pre-market 08:42 ET → clamp loop never runs; identical to marketCloseDate.
  strictEqual(recoveryCloseDate("2026-06-10T12:42:51Z"), "2026-06-09");
  strictEqual(marketCloseDate("2026-06-10T12:42:51Z"), "2026-06-09");
});

test("recoveryCloseDate: delayed Monday detector rolls back across the weekend", () => {
  // Mon 2026-06-08 detector slips to 20:30 UTC = 16:30 ET; clamp to ~15:30 ET
  // → prior session walks Sun→Sat→Fri.
  strictEqual(recoveryCloseDate("2026-06-08T20:30:00Z"), "2026-06-05");
});

test("marketCloseDate: build path unchanged — captures today's close at/after 16:00 ET", () => {
  // Regression guard: the 09:30/manual BUILD path must keep rolling forward
  // at the ET close so it stays byte-identical to build-strong-picks.ts.
  strictEqual(marketCloseDate("2026-06-10T20:00:00Z"), "2026-06-10"); // 16:00 ET
  strictEqual(marketCloseDate("2026-06-10T12:42:51Z"), "2026-06-09"); // 08:42 ET pre-market
});

// --- isRegularSessionOpen: refuse a build that GitHub delayed into market hours ---
// 2026-06-22 is a Monday (June EDT → ET = UTC-4).

test("isRegularSessionOpen: 2026-06-22 incident — 09:30 cron delayed to 11:04 ET → true", () => {
  // The contamination: a 5.5h slip landed the build mid-session, where /quote
  // is live intraday. The guard must catch exactly this.
  strictEqual(isRegularSessionOpen(new Date("2026-06-22T15:04:03Z")), true); // 11:04 ET
});

test("isRegularSessionOpen: normal pre-market 09:30 UTC (05:30 ET) → false", () => {
  // The healthy window the build is scheduled for — market closed, /quote ≈
  // prior settled close, so building is faithful.
  strictEqual(isRegularSessionOpen(new Date("2026-06-22T09:30:00Z")), false); // 05:30 ET
});

test("isRegularSessionOpen: after the close 16:55 ET → false", () => {
  // The delayed-recovery window — past 16:00 ET, session closed.
  strictEqual(isRegularSessionOpen(new Date("2026-06-22T20:55:00Z")), false); // 16:55 ET
});

test("isRegularSessionOpen: session boundaries are [09:30, 16:00) ET", () => {
  strictEqual(isRegularSessionOpen(new Date("2026-06-22T13:29:00Z")), false); // 09:29 ET — pre-open
  strictEqual(isRegularSessionOpen(new Date("2026-06-22T13:30:00Z")), true); //  09:30 ET — open
  strictEqual(isRegularSessionOpen(new Date("2026-06-22T19:59:00Z")), true); //  15:59 ET — open
  strictEqual(isRegularSessionOpen(new Date("2026-06-22T20:00:00Z")), false); // 16:00 ET — closed
});

test("isRegularSessionOpen: weekend is never an open session", () => {
  // Sat 2026-06-20 16:00 UTC = 12:00 ET — midday but no session, so a weekend
  // force_run backfill is never wrongly flagged as in-session.
  strictEqual(isRegularSessionOpen(new Date("2026-06-20T16:00:00Z")), false);
});

// --- NYSE holiday calendar (issue #48) ---

test("isNyseHoliday: observed full-closure dates are holidays", () => {
  strictEqual(isNyseHoliday(new Date("2026-06-19T14:00:00Z")), true); // Juneteenth (the incident)
  strictEqual(isNyseHoliday(new Date("2026-05-25T14:00:00Z")), true); // Memorial Day
  strictEqual(isNyseHoliday(new Date("2026-07-03T14:00:00Z")), true); // Independence Day observed (Jul 4 = Sat)
  strictEqual(isNyseHoliday(new Date("2026-11-26T14:00:00Z")), true); // Thanksgiving
});

test("isNyseHoliday: ordinary trading days and the un-observed actual date are not", () => {
  strictEqual(isNyseHoliday(new Date("2026-06-18T14:00:00Z")), false); // Thu before Juneteenth
  strictEqual(isNyseHoliday(new Date("2026-07-04T14:00:00Z")), false); // actual Jul 4 (Sat) — closure is the 3rd
});

test("isUsTradingDay: a weekday NYSE holiday is NOT a trading day (was true pre-#48)", () => {
  strictEqual(isUsTradingDay(new Date("2026-06-19T14:00:00Z")), false); // Juneteenth, a Friday
  strictEqual(isUsTradingDay(new Date("2026-05-25T14:00:00Z")), false); // Memorial Day, a Monday
  strictEqual(isUsTradingDay(new Date("2026-06-18T14:00:00Z")), true); // ordinary Thursday
});

test("marketCloseDate: pre-market run the session after Juneteenth targets the prior trading close", () => {
  // THE fix for the 06-19 phantom: Mon 2026-06-22 09:30 UTC (05:30 ET) rolls
  // back Sun→Sat→Fri 06-19 (Juneteenth, skip)→Thu 06-18. Pre-#48 this returned
  // the holiday 2026-06-19.
  strictEqual(marketCloseDate("2026-06-22T09:30:00Z"), "2026-06-18");
});

test("marketCloseDate: an after-close run ON a holiday rolls back off it", () => {
  // Fri 2026-06-19 20:30 UTC = 16:30 ET (>=16 → target today = Juneteenth) →
  // skip the holiday → Thu 06-18.
  strictEqual(marketCloseDate("2026-06-19T20:30:00Z"), "2026-06-18");
});

test("marketCloseDate: ordinary days are unchanged by the holiday logic", () => {
  // Regression: prior-day and same-day walks that don't touch a holiday must
  // be byte-identical to pre-#48 behavior.
  strictEqual(marketCloseDate("2026-06-18T12:42:51Z"), "2026-06-17"); // Thu 08:42 ET pre-market → Wed
  strictEqual(marketCloseDate("2026-06-18T20:00:00Z"), "2026-06-18"); // Thu 16:00 ET → today
});

test("recoveryCloseDate: inherits holiday skip (delegates to marketCloseDate)", () => {
  // The 18:00 detector delayed to 16:55 ET on Mon 2026-06-22 clamps to
  // mid-session then targets the prior trading close — now correctly 06-18,
  // not the holiday 06-19.
  strictEqual(recoveryCloseDate("2026-06-22T20:55:00Z"), "2026-06-18");
});

test("NYSE holiday table stays ahead of today — extend it before it lapses", () => {
  // Rot-guard: fail loud in CI (never at render time) once `today` is within a
  // year of the table horizon, so an unlisted holiday can't silently become a
  // trading day again (issue #48). Fix = transcribe the next year from
  // nyse.com into NYSE_HOLIDAYS_OBSERVED and bump NYSE_HOLIDAY_TABLE_THROUGH.
  const horizon = new Date(`${NYSE_HOLIDAY_TABLE_THROUGH}T00:00:00Z`);
  const oneYearOut = new Date();
  oneYearOut.setUTCFullYear(oneYearOut.getUTCFullYear() + 1);
  ok(
    horizon.getTime() >= oneYearOut.getTime(),
    `NYSE holiday table ends ${NYSE_HOLIDAY_TABLE_THROUGH}; extend it (within 1y of today).`
  );
});
