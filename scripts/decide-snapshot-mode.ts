/**
 * Thin CLI wrapper over lib/snapshot-mode.ts::decideSnapshotMode so the
 * refresh-strong-picks workflow consumes the SAME tested decision the unit
 * tests pin (lib/snapshot-mode.test.ts) instead of re-deriving it in bash.
 *
 * Inputs via env (all "true"/"false"):
 *   SESSION_OPEN    — isRegularSessionOpen(now)   (from snapshot-guard.ts)
 *   SNAPSHOT_EXISTS — expected snapshot already on origin/main (git cat-file)
 *   IS_RECOVERY     — SCHEDULE === "0 18 * * *"
 *
 * (TRADING is no longer an input: the 2026-07-04 staleness incident showed
 * that skipping on "today is a non-trading day" silently drops the last close
 * before a holiday/weekend when its build failed. The decision now keys on
 * the target snapshot's existence — see lib/snapshot-mode.ts.)
 *
 * Output (GITHUB_OUTPUT-friendly key=value on stdout):
 *   mode=skip|build|fail
 *   reason=<machine-readable reason>
 */
import { decideSnapshotMode } from "../lib/snapshot-mode";

const asBool = (v: string | undefined): boolean => v === "true";

const decision = decideSnapshotMode({
  snapshotExists: asBool(process.env.SNAPSHOT_EXISTS),
  isRecovery: asBool(process.env.IS_RECOVERY),
  sessionOpen: asBool(process.env.SESSION_OPEN),
});

process.stdout.write(`mode=${decision.mode}\nreason=${decision.reason}\n`);
