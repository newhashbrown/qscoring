/**
 * Single source of truth for the refresh-strong-picks guard decision. The
 * workflow YAML used to encode this as a bash `if` ladder; centralising it
 * here makes every branch unit-testable (lib/snapshot-mode.test.ts) and keeps
 * the scheduled cron, the 18:00 recovery detector, and manual dispatch on one
 * code path.
 *
 * Ordering:
 *   1. expected snapshot already on origin/main → skip (append-only no-op)
 *   2. 18:00 recovery detector + snapshot still missing → fail (never rescore)
 *   3. regular session open (09:30–16:00 ET) → fail (live /quote would be
 *      frozen under the prior-close label — the 2026-06-22 contamination)
 *   4. otherwise → build (market closed + snapshot missing = a faithful
 *      rescore, whether or not *today* is a trading day)
 *
 * NOTE (audit fix): the session-open refusal is now UNCONDITIONAL. It used to
 * be bypassable with force_run, but force_run's only reachable effect was
 * disabling this guard on a weekday — the exact dangerous case. Deliberate
 * backfills go through scripts/backfill-snapshots.ts (FMP historical close),
 * never a live in-session rescore.
 *
 * NOTE (2026-07-04 staleness incident): the old rule 1 skipped whenever *now*
 * fell on a weekend/holiday, keying the decision on the RUN date instead of
 * the TARGET close. When the 2026-07-02 pre-market build failed (FMP 429) and
 * the next days were the observed July-4th holiday + weekend, every run
 * skipped "non-trading-day" while the 2026-07-02 close stayed unbuilt — four
 * days of silent staleness with a green dead-man's switch. Market-closed
 * freshness is a property of the missing snapshot, not of today's calendar:
 * on a holiday/weekend morning, /quote still returns the target session's
 * settled close (no session has traded since), so the rescore is faithful.
 * The snapshotExists check preserves the weekend no-op (Sunday's
 * expected=Friday already landed on Saturday).
 */
export type SnapshotMode = "skip" | "build" | "fail";

export interface SnapshotModeInput {
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
