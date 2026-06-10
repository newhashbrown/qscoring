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
 * Output is GITHUB_OUTPUT-friendly `key=value` lines on stdout:
 *   expected=YYYY-MM-DD   — the prior-trading-day close this run targets
 *   trading=true|false    — whether *now* is a US trading day (ET, Mon–Fri)
 */
import { isUsTradingDay, marketCloseDate } from "../lib/market-date";

const now = new Date();
const expected = marketCloseDate(now.toISOString());
const trading = isUsTradingDay(now);

process.stdout.write(`expected=${expected}\ntrading=${trading}\n`);
