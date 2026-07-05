import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { FACTOR_STALENESS_MAX_DAYS, isFactorDataStale } from "./factor-exposures";

// isFactorDataStale is the render-time guard that fails the Factor Profile
// closed (existing no-data state) when the monthly Fama-French refresh has
// stopped landing, instead of letting betas silently age. 75 days ≈ two
// missed monthly publications.

const NOW = new Date("2026-07-04T12:00:00Z");

test("fresh window (last month-end) is not stale", () => {
  strictEqual(isFactorDataStale("2026-05-31", "2026-06-28", NOW), false);
});

test("window one FF publication behind is still served (normal lag)", () => {
  // 2026-04-30 is 65 days before NOW — inside the 75-day budget.
  strictEqual(isFactorDataStale("2026-04-30", "2026-06-28", NOW), false);
});

test("window ~two missed publications behind fails closed", () => {
  strictEqual(isFactorDataStale("2026-03-31", "2026-04-05", NOW), true);
});

test("boundary: exactly FACTOR_STALENESS_MAX_DAYS old is not yet stale", () => {
  const end = new Date(NOW.getTime() - FACTOR_STALENESS_MAX_DAYS * 86_400_000);
  const iso = end.toISOString().slice(0, 10);
  strictEqual(isFactorDataStale(iso, null, new Date(iso + "T00:00:00Z")), false);
});

test("missing window_end falls back to snapshot_date", () => {
  strictEqual(isFactorDataStale(null, "2026-06-28", NOW), false);
  strictEqual(isFactorDataStale(null, "2026-03-01", NOW), true);
});

test("no recency information at all fails closed", () => {
  strictEqual(isFactorDataStale(null, null, NOW), true);
});

test("unparseable dates fail closed", () => {
  strictEqual(isFactorDataStale("not-a-date", null, NOW), true);
});
