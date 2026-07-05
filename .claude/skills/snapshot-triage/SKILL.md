---
name: snapshot-triage
description: Diagnose a failed or suspect daily snapshot / batch-pipeline run (GitHub Actions cron jobs). Walks the known failure modes before touching any data.
disable-model-invocation: true
---

# Snapshot / batch-pipeline triage

The scoring pipeline runs on GitHub Actions cron (NOT Workers cron). Snapshots are **append-only by policy** — never edit a historical `data/snapshots/*.json` in place; `/performance` forward-track integrity depends on it.

## Pipeline map

| Workflow | Schedule (UTC) | Writes |
|---|---|---|
| `refresh-universe-stats.yml` | 02:00 daily | `data/universe-stats.json` |
| `refresh-strong-picks.yml` | 09:30 daily | strong-picks + scoreboard + `data/snapshots/YYYY-MM-DD.json`, then curls `/api/cron/watchlist-alerts` after 240s deploy wait |
| `weekly-recap.yml` | Mon 14:00 | forward-track recap |

Workflows commit-if-changed → push → Workers Builds redeploys.

## Triage order

1. `gh run list --workflow=refresh-strong-picks.yml --limit 5` — find the failed/suspect run, read its log before touching anything.
2. Check the known failure modes below — most "failures" need no data intervention.

## Known failure modes

- **FMP 429 rate limiting** — retry-backoff and rate-limit persistence are built in. Re-run the job; do not hand-edit data files.
- **Delayed cron ≠ missed snapshot.** If GitHub delays the 09:30 job past 20:00 UTC, the recovery detector can false-fail with "snapshot missing, backfill". Do NOT backfill — the `recoveryCloseDate` guard handles it and it self-heals next morning.
- **Session-open contamination** — a build that runs after market open can freeze intraday prices under the prior day's label (the 2026-06-19 incident). Verify the snapshot's date/session consistency before trusting its prices; a `session_open` guard now blocks this.
- **Split-basis phantoms** — never trust FMP split dates alone. `data/splits.json` is the ledger-boundary store consumed by IC, recaps, and exit-prices.

## If data really is contaminated

1. Back up the affected D1 rows before deleting anything.
2. Remove the contaminated `data/snapshots/YYYY-MM-DD.json` and any recap references; delete the matching D1 rows.
3. Backfill with `npm run backfill-snapshots` (paced), then verify the affected dates on `/performance`.
4. Do NOT delete pre-2026-06-12 data — the `MIN_COHORT_N=600` gate already excludes those eras by design.
