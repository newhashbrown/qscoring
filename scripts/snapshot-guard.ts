/**
 * Prints the snapshot identity the refresh-strong-picks workflow should
 * target, for its guard / recovery-detector logic.
 *
 * Reuses the SAME marketCloseDate() the build writes the snapshot with, so
 * the guard can never target a different date than build-strong-picks.ts
 * actually produces — and isUsTradingDay() for the non-trading-day skip
 * (identical to the script's own early-exit). No date math is duplicated in
 * the workflow YAML; it only consumes these values.
 *
 * The 18:00 UTC recovery DETECTOR (SCHEDULE === RECOVERY_SCHEDULE) is the one
 * exception: it must verify the snapshot the 09:30 run produced regardless of
 * how late GitHub dispatches it, so it uses recoveryCloseDate() (delay-clamped
 * to mid-session). The 09:30 build path and manual dispatch keep
 * marketCloseDate(now) so guard and build-strong-picks.ts stay byte-identical.
 * See the 2026-06-10 false-positive incident.
 *
 * Output is GITHUB_OUTPUT-friendly `key=value` lines on stdout:
 *   expected=YYYY-MM-DD   — the prior-trading-day close this run targets
 *   trading=true|false    — whether *now* is a US trading day (ET, Mon–Fri)
 */
import { isUsTradingDay, marketCloseDate, recoveryCloseDate } from "../lib/market-date";

const RECOVERY_SCHEDULE = "0 18 * * *";

const now = new Date();
const isRecovery = process.env.SCHEDULE === RECOVERY_SCHEDULE;
const expected = isRecovery
  ? recoveryCloseDate(now.toISOString())
  : marketCloseDate(now.toISOString());
const trading = isUsTradingDay(now);

process.stdout.write(`expected=${expected}\ntrading=${trading}\n`);
