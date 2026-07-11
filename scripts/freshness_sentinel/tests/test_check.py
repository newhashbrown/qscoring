"""Freshness-sentinel unit tests.

Pinned to the July 2026 calendar around the incident this sentinel exists
for: Thu 2026-07-02 was a full session, Fri 2026-07-03 was the observed
Independence-Day closure (Jul 4 fell on a Saturday). Uses the real XNYS
calendar from exchange_calendars — the same object production uses — so the
holiday handling under test is the shipped behavior, not a mock's.
"""

import json
from datetime import date, datetime, timezone
from pathlib import Path

import exchange_calendars as xcals
import pytest

from freshness_sentinel.check import (
    last_completed_session,
    latest_snapshot_date,
    stale_universe_tickers,
    trading_days_behind,
)


@pytest.fixture(scope="module")
def cal():
    return xcals.get_calendar("XNYS")


def utc(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=timezone.utc)


class TestLastCompletedSession:
    def test_saturday_after_observed_holiday_resolves_to_thursday(self, cal):
        # Sat 2026-07-04 10:30 UTC — Friday was the observed closure, so the
        # last completed session is Thu 2026-07-02. Weekday math would say
        # Friday and false-alarm.
        assert last_completed_session(cal, utc(2026, 7, 4, 10, 30)) == date(2026, 7, 2)

    def test_mid_session_does_not_count_as_completed(self, cal):
        # Thu 2026-07-02 18:00 UTC = 14:00 ET, market open — Thursday's close
        # hasn't settled, so the last completed session is Wednesday.
        assert last_completed_session(cal, utc(2026, 7, 2, 18)) == date(2026, 7, 1)

    def test_after_close_counts_same_day(self, cal):
        # Thu 2026-07-02 21:00 UTC = 17:00 ET, after the 16:00 close.
        assert last_completed_session(cal, utc(2026, 7, 2, 21)) == date(2026, 7, 2)

    def test_naive_datetime_is_rejected(self, cal):
        with pytest.raises(ValueError):
            last_completed_session(cal, datetime(2026, 7, 4, 10, 30))


class TestTradingDaysBehind:
    def test_ledger_has_last_close(self, cal):
        assert trading_days_behind(cal, date(2026, 7, 2), date(2026, 7, 2)) == 0

    def test_one_session_behind_is_the_normal_overnight_state(self, cal):
        assert trading_days_behind(cal, date(2026, 7, 1), date(2026, 7, 2)) == 1

    def test_two_sessions_behind_spans_no_weekend(self, cal):
        # The incident state: June 30 ledger vs the July 2 close = 2 behind.
        assert trading_days_behind(cal, date(2026, 6, 30), date(2026, 7, 2)) == 2

    def test_weekend_and_holiday_are_not_counted(self, cal):
        # Fri 2026-06-26 ledger vs Mon 2026-06-29 close: only Monday's session
        # separates them (the weekend is not staleness).
        assert trading_days_behind(cal, date(2026, 6, 26), date(2026, 6, 29)) == 1

    def test_snapshot_in_the_future_raises(self, cal):
        with pytest.raises(RuntimeError, match="AFTER"):
            trading_days_behind(cal, date(2026, 7, 2), date(2026, 7, 1))

    def test_non_session_snapshot_raises(self, cal):
        # 2026-07-03 was the observed holiday — a ledger entry there is
        # contamination, not freshness.
        with pytest.raises(RuntimeError, match="not an XNYS session"):
            trading_days_behind(cal, date(2026, 7, 3), date(2026, 7, 6))


class TestLatestSnapshotDate:
    def test_newest_dated_file_wins(self, tmp_path: Path):
        for name in ("2026-06-30.json", "2026-07-01.json", "notes.md", "latest.json"):
            (tmp_path / name).write_text("{}")
        assert latest_snapshot_date(tmp_path) == date(2026, 7, 1)

    def test_empty_directory_raises(self, tmp_path: Path):
        with pytest.raises(RuntimeError, match="no YYYY-MM-DD"):
            latest_snapshot_date(tmp_path)

    def test_missing_directory_raises(self, tmp_path: Path):
        with pytest.raises(RuntimeError, match="does not exist"):
            latest_snapshot_date(tmp_path / "nope")


class TestStaleUniverseTickers:
    """Per-ticker staleness: a current-universe name absent from the last N
    snapshots has data-as-of older than ~N trading days."""

    def _setup(self, tmp_path, snapshots, universe):
        snap_dir = tmp_path / "snapshots"
        snap_dir.mkdir()
        for d, tickers in snapshots.items():
            (snap_dir / f"{d}.json").write_text(
                json.dumps({"picks": [{"ticker": t} for t in tickers]})
            )
        uni = tmp_path / "compare-universe.json"
        uni.write_text(json.dumps({"entries": [{"symbol": s} for s in universe]}))
        return snap_dir, uni

    def test_all_covered_recently_none_stale(self, tmp_path):
        snap_dir, uni = self._setup(
            tmp_path,
            {"2026-07-07": ["AAPL", "MSFT"], "2026-07-08": ["AAPL", "MSFT"], "2026-07-09": ["AAPL", "MSFT"]},
            ["AAPL", "MSFT"],
        )
        assert stale_universe_tickers(snap_dir, uni, 3) == set()

    def test_ticker_absent_from_last_3_is_stale(self, tmp_path):
        snap_dir, uni = self._setup(
            tmp_path,
            {
                "2026-07-05": ["AAPL", "MSFT", "JPM"],  # JPM only here (4th-newest)
                "2026-07-07": ["AAPL", "MSFT"],
                "2026-07-08": ["AAPL", "MSFT"],
                "2026-07-09": ["AAPL", "MSFT"],
            },
            ["AAPL", "MSFT", "JPM"],
        )
        assert stale_universe_tickers(snap_dir, uni, 3) == {"JPM"}

    def test_ticker_not_in_current_universe_not_flagged(self, tmp_path):
        # MSFT left the universe — absent from snapshots but NOT flagged stale.
        snap_dir, uni = self._setup(
            tmp_path,
            {"2026-07-07": ["AAPL"], "2026-07-08": ["AAPL"], "2026-07-09": ["AAPL"]},
            ["AAPL"],
        )
        assert stale_universe_tickers(snap_dir, uni, 3) == set()
