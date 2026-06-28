"""TDD: monthly total returns + excess returns."""

from __future__ import annotations

import pandas as pd
import pytest

from factor_exposures.returns import monthly_total_returns, to_excess


def test_monthly_total_returns_uses_month_end_last_close():
    idx = pd.to_datetime(["2020-01-15", "2020-01-31", "2020-02-28", "2020-03-31"])
    px = pd.Series([90.0, 100.0, 110.0, 121.0], index=idx)
    r = monthly_total_returns(px)
    assert isinstance(r.index, pd.PeriodIndex)
    assert list(r.index.astype(str)) == ["2020-02", "2020-03"]
    assert r.loc[pd.Period("2020-02", "M")] == pytest.approx(0.10)
    assert r.loc[pd.Period("2020-03", "M")] == pytest.approx(0.10)


def test_monthly_total_returns_handles_unsorted_input():
    idx = pd.to_datetime(["2020-02-28", "2020-01-31", "2020-03-31"])
    px = pd.Series([110.0, 100.0, 121.0], index=idx)
    r = monthly_total_returns(px)
    assert list(r.index.astype(str)) == ["2020-02", "2020-03"]


def test_to_excess_subtracts_rf_on_aligned_months():
    idx = pd.period_range("2020-02", periods=2, freq="M")
    r = pd.Series([0.10, 0.08], index=idx)
    rf = pd.Series([0.01, 0.02], index=idx)
    ex = to_excess(r, rf)
    assert ex.loc[pd.Period("2020-02", "M")] == pytest.approx(0.09)
    assert ex.loc[pd.Period("2020-03", "M")] == pytest.approx(0.06)


def test_to_excess_inner_joins_mismatched_indices():
    r = pd.Series([0.1, 0.2, 0.3], index=pd.period_range("2020-01", periods=3, freq="M"))
    rf = pd.Series([0.01, 0.02], index=pd.period_range("2020-02", periods=2, freq="M"))
    ex = to_excess(r, rf)
    assert list(ex.index.astype(str)) == ["2020-02", "2020-03"]
