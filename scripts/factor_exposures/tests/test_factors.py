"""TDD: Fama-French frame normalization + alignment (the #1 silent-garbage risk).

Guards: percent->decimal, trailing-space columns ('Mom '), 'Mom'->'MOM',
RF read from the 5-factor frame, and inner-join on month."""

from __future__ import annotations

import pandas as pd
import pytest

from factor_exposures.factors import build_factor_frame
from factor_exposures.regression import FACTORS


def _raw_tables():
    idx = pd.period_range("2020-01", periods=3, freq="M")
    raw_5f = pd.DataFrame(
        {
            "Mkt-RF": [5.0, -2.0, 1.0],
            "SMB": [1.0, 0.5, -0.5],
            "HML": [0.0, 1.0, 2.0],
            "RMW": [0.3, 0.2, 0.1],
            "CMA": [-0.4, 0.1, 0.2],
            "RF": [0.1, 0.1, 0.2],
        },
        index=idx,
    )
    # Momentum table: trailing-space column + an EXTRA trailing month, to prove
    # both the rename and the inner-join.
    idx_mom = pd.period_range("2020-01", periods=4, freq="M")
    raw_mom = pd.DataFrame({"Mom ": [2.0, -1.0, 0.5, 9.9]}, index=idx_mom)
    return raw_5f, raw_mom


def test_normalizes_units_columns_and_rf():
    factors, rf = build_factor_frame(*_raw_tables())
    assert list(factors.columns) == list(FACTORS)
    assert isinstance(factors.index, pd.PeriodIndex)
    # percent -> decimal
    assert factors["Mkt-RF"].iloc[0] == pytest.approx(0.05)
    assert factors["MOM"].iloc[0] == pytest.approx(0.02)
    assert rf.iloc[0] == pytest.approx(0.001)


def test_inner_join_drops_extra_momentum_month():
    factors, rf = build_factor_frame(*_raw_tables())
    assert len(factors) == 3
    assert len(rf) == 3


def test_handles_whitespace_in_five_factor_columns():
    raw_5f, raw_mom = _raw_tables()
    raw_5f = raw_5f.rename(columns={"Mkt-RF": "Mkt-RF ", "RF": " RF"})
    factors, rf = build_factor_frame(raw_5f, raw_mom)
    assert "Mkt-RF" in factors.columns
    assert rf.iloc[0] == pytest.approx(0.001)
