/**
 * Single source of truth for the refresh-strong-picks guard decision. The
 * workflow YAML used to encode this as a bash `if` ladder; centralising it
 * here makes every branch unit-testable (lib/snapshot-mode.test.ts) and keeps
 * the scheduled cron, the 18:00 recovery detector, and manual dispatch on one
 * code path.
 *
 * Ordering mirrors the original guard exactly:
 *   1. non-trading day (weekend / NYSE holiday) → skip
 *   2. expected snapshot already on origin/main → skip (append-only no-op)
 *   3. 18:00 recovery detector + snapshot still missing → fail (never rescore)
 *   4. regular session open (09:30–16:00 ET) → fail (live /quote would be
 *      frozen under the prior-close label — the 2026-06-22 contamination)
 *   5. otherwise → build
 *
 * NOTE (audit fix): the session-open refusal is now UNCONDITIONAL. It used to
 * be bypassable with force_run, but force_run's only reachable effect was
 * disabling this guard on a weekday — the exact dangerous case. Deliberate
 * backfills go through scripts/backfill-snapshots.ts (FMP historical close),
 * never a live in-session rescore.
 */
export type SnapshotMode = "skip" | "build" | "fail";

export interface SnapshotModeInput {
  /** isUsTradingDay(now): ET weekday that is not an NYSE holiday. */
  trading: boolean;
  /** Whether the expected snapshot JSON already exists on origin/main. */
  snapshotExists: boolean;
  /** Whether this run is the 18:00 UTC recovery detector. */
  isRecovery: boolean;
  /** isRegularSessionOpen(now): inside 09:30–16:00 ET on a weekday. */
  sessionOpen: boolean;
}

export interface SnapshotModeDecision {
  mode: SnapshotMode;
  reason: string;
}

export function decideSnapshotMode(input: SnapshotModeInput): SnapshotModeDecision {
  if (!input.trading) {
    return { mode: "skip", reason: "non-trading-day" };
  }
  if (input.snapshotExists) {
    return { mode: "skip", reason: "snapshot-already-present" };
  }
  if (input.isRecovery) {
    return { mode: "fail", reason: "recovery-detector-snapshot-missing" };
  }
  if (input.sessionOpen) {
    return { mode: "fail", reason: "session-open-would-contaminate" };
  }
  return { mode: "build", reason: "market-closed-faithful-rescore" };
}
