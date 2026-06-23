import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { decideSnapshotMode } from "./snapshot-mode";

// decideSnapshotMode is the single source of truth for what the
// refresh-strong-picks guard does, replacing the bash `if` ladder that used
// to live in the workflow YAML. Each case below maps to a real operational
// scenario from the audit (areas 1, 5, 7).

const base = {
  trading: true,
  snapshotExists: false,
  isRecovery: false,
  sessionOpen: false,
} as const;

test("pre-market on a trading day with no snapshot → build", () => {
  // 05:30 ET scheduled/manual run: market closed, /quote ≈ prior close.
  strictEqual(decideSnapshotMode({ ...base }).mode, "build");
});

test("after-close on a trading day with no snapshot → build", () => {
  // 18:00 ET manual run: market closed again, faithful rescore.
  strictEqual(decideSnapshotMode({ ...base, sessionOpen: false }).mode, "build");
});

test("delayed into the regular session (11:04 ET) on a trading day → fail", () => {
  // The 2026-06-22 contamination: /quote is live intraday and would be
  // frozen under the prior-close label. Must refuse — and force_run can no
  // longer rescue it (PR A removes that bypass).
  strictEqual(decideSnapshotMode({ ...base, sessionOpen: true }).mode, "fail");
});

test("non-trading day (weekend/holiday) → skip", () => {
  strictEqual(decideSnapshotMode({ ...base, trading: false }).mode, "skip");
});

test("snapshot already present → skip (append-only no-op)", () => {
  strictEqual(decideSnapshotMode({ ...base, snapshotExists: true }).mode, "skip");
});

test("18:00 recovery detector with snapshot missing → fail (never rescore)", () => {
  strictEqual(
    decideSnapshotMode({ ...base, isRecovery: true, snapshotExists: false }).mode,
    "fail"
  );
});

test("18:00 recovery detector when snapshot exists → skip (no false alarm)", () => {
  // snapshotExists is checked before the recovery branch, so a landed
  // snapshot does not trip the recovery alert.
  strictEqual(
    decideSnapshotMode({ ...base, isRecovery: true, snapshotExists: true }).mode,
    "skip"
  );
});

test("non-trading day takes precedence over an open session", () => {
  // Ordering guard: a holiday weekday inside session hours still skips
  // (trading=false short-circuits before the session check).
  strictEqual(
    decideSnapshotMode({ ...base, trading: false, sessionOpen: true }).mode,
    "skip"
  );
});

test("decision carries a non-empty machine-readable reason", () => {
  const d = decideSnapshotMode({ ...base, sessionOpen: true });
  strictEqual(typeof d.reason, "string");
  strictEqual(d.reason.length > 0, true);
});
