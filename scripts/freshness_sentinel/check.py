"""Freshness sentinel — alerts when the committed quant-snapshot ledger falls
behind the NYSE calendar.

Why this exists (2026-07-02..04 staleness incident): every job-level guard in
the pipeline protects the *scorer* (no contaminated builds, no mid-session
rescores), but nothing watched whether fresh data actually LANDED. A failed
build followed by holiday/weekend skip-mode runs kept every workflow green —
and the dead-man's switch pinged on those green no-ops — while the site sat
on a June 30 corpus. This sentinel is the independent freshness watcher:

  RULE: the newest data/snapshots/YYYY-MM-DD.json may be at most
  TOLERANCE_TRADING_DAYS (1) trading day behind the last COMPLETED NYSE
  session. Weekends/holidays are not staleness — the comparison walks real
  XNYS sessions via exchange_calendars, never naive weekday math.

Fail-loud contract: inability to determine freshness (missing ledger, calendar
error, malformed dates, a snapshot dated in the future) is itself an alert,
never a silent pass. The healthchecks ping fires ONLY on a verified-fresh
verdict, so a hung or crashed sentinel also surfaces through the dead-man's
switch.

Runs from .github/workflows/freshness-sentinel.yml against the repo checkout
(the committed ledger is the source of truth the site deploys from).
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import exchange_calendars as xcals
import pandas as pd

TOLERANCE_TRADING_DAYS = 1
SNAPSHOT_DIR = Path("data/snapshots")
SNAPSHOT_NAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.json$")

# Mirror the Resend sender/recipient used by every workflow failure email.
ALERT_FROM = "QScoring Alerts <alerts@qscoring.com>"
ALERT_TO = "gagansingh2000@yahoo.com"
RESEND_URL = "https://api.resend.com/emails"


def latest_snapshot_date(snapshot_dir: Path) -> date:
    """Newest ledger date, from the committed append-only snapshot files."""
    if not snapshot_dir.is_dir():
        raise RuntimeError(f"snapshot directory {snapshot_dir} does not exist")
    dates = sorted(
        m.group(1)
        for p in snapshot_dir.iterdir()
        if (m := SNAPSHOT_NAME_RE.match(p.name))
    )
    if not dates:
        raise RuntimeError(f"no YYYY-MM-DD.json snapshots found in {snapshot_dir}")
    return date.fromisoformat(dates[-1])


def last_completed_session(cal, now_utc: datetime) -> date:
    """The most recent XNYS session whose CLOSE is at or before now_utc.

    A session in progress does not count as completed — its close hasn't
    settled, so the pipeline cannot owe a snapshot for it yet.
    """
    ts = pd.Timestamp(now_utc)
    if ts.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware")
    session = cal.date_to_session(pd.Timestamp(ts.date()), direction="previous")
    if cal.session_close(session) > ts:
        session = cal.previous_session(session)
    return session.date()


def trading_days_behind(cal, snapshot: date, last_session: date) -> int:
    """XNYS sessions between the ledger head and the last completed session.

    0 = the ledger has the last completed close; 1 = one session behind
    (normal overnight state before the pre-market build); >1 = stale.
    """
    snap_ts = pd.Timestamp(snapshot)
    last_ts = pd.Timestamp(last_session)
    if snap_ts > last_ts:
        raise RuntimeError(
            f"latest snapshot {snapshot} is AFTER the last completed session "
            f"{last_session} — look-ahead contamination or a clock error"
        )
    if not cal.is_session(snap_ts):
        raise RuntimeError(
            f"latest snapshot {snapshot} is not an XNYS session — the ledger "
            "should only ever contain real trading days"
        )
    # sessions_distance counts sessions in [snapshot, last_session] inclusive.
    return int(cal.sessions_distance(snap_ts, last_ts)) - 1


def send_alert(subject: str, text: str) -> None:
    """Send a Resend alert. Raises on any failure — the workflow-level
    failure email is the backstop, so a swallowed send would be silent."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not set — cannot send the freshness alert")
    payload = json.dumps(
        {"from": ALERT_FROM, "to": [ALERT_TO], "subject": subject, "text": text}
    ).encode()
    req = urllib.request.Request(
        RESEND_URL,
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        print(f"Alert email accepted by Resend: {res.read().decode()[:200]}")


def ping_healthcheck() -> None:
    """Verified-fresh dead-man ping. Best-effort: a failed ping just means
    healthchecks alarms after grace, which is the correct failure mode."""
    url = os.environ.get("HEALTHCHECK_SENTINEL_URL")
    if not url:
        print("HEALTHCHECK_SENTINEL_URL not set — skipping ping (create the check and add the secret to arm this).")
        return
    try:
        with urllib.request.urlopen(url, timeout=30) as res:
            print(f"Healthcheck pinged ({res.status}).")
    except Exception as err:  # noqa: BLE001 — deliberate: see docstring
        print(f"WARNING: healthcheck ping failed ({err}) — the dead-man's switch will fire.", file=sys.stderr)


def main() -> int:
    now = datetime.now(timezone.utc)
    run_url = os.environ.get("RUN_URL", "(no run URL)")
    try:
        cal = xcals.get_calendar("XNYS")
        snapshot = latest_snapshot_date(SNAPSHOT_DIR)
        last_session = last_completed_session(cal, now)
        behind = trading_days_behind(cal, snapshot, last_session)
    except Exception as err:  # noqa: BLE001 — fail-loud contract
        msg = (
            "The freshness sentinel could not determine snapshot freshness — "
            f"treating this as an incident, not a pass.\n\nError: {err}\n\nRun: {run_url}"
        )
        print(f"::error::{msg}", file=sys.stderr)
        send_alert("🚨 QScoring freshness sentinel: cannot determine freshness", msg)
        return 1

    print(
        f"Latest snapshot {snapshot}; last completed NYSE session {last_session}; "
        f"behind={behind} trading day(s) (tolerance {TOLERANCE_TRADING_DAYS})."
    )
    if behind > TOLERANCE_TRADING_DAYS:
        msg = (
            f"The committed quant snapshot is {behind} trading days behind the last "
            f"completed NYSE session.\n\nLatest snapshot: {snapshot}\nLast completed "
            f"session: {last_session}\n\nThe scorer's guards fail safe (they refuse "
            "contaminated builds), so this usually means an upstream ingest failure "
            "went unnoticed. Check the refresh-strong-picks runs, then rebuild the "
            f"missing day(s) deliberately if needed.\n\nRun: {run_url}"
        )
        print(f"::error::{msg}", file=sys.stderr)
        send_alert(
            f"🚨 QScoring snapshot is stale: {behind} trading days behind ({snapshot} vs {last_session})",
            msg,
        )
        return 1

    ping_healthcheck()
    return 0


if __name__ == "__main__":
    sys.exit(main())
