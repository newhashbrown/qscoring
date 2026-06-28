"""Shared synthetic-data factory for the regression tests.

The unit tests are network-free: they build a factor frame with KNOWN betas and
an injected alpha + noise, so the regression must recover those betas. This is
the only automated guard on the regression math (real-data sign/alignment bugs
are caught by the manual spot-check, not here)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from factor_exposures.regression import FACTORS


def _make_panel(
    n: int,
    betas: dict[str, float],
    *,
    alpha: float = 0.0,
    noise_sd: float = 0.005,
    seed: int = 0,
    start: str = "2015-01",
    factor_sd: float = 0.04,
) -> tuple[pd.Series, pd.DataFrame]:
    """Return (excess_returns, factors) on a monthly PeriodIndex such that
    excess = alpha + factors @ betas + N(0, noise_sd)."""
    rng = np.random.default_rng(seed)
    idx = pd.period_range(start, periods=n, freq="M")
    factors = pd.DataFrame(
        {f: rng.normal(0.0, factor_sd, n) for f in FACTORS}, index=idx
    )
    beta_vec = np.array([betas[f] for f in FACTORS])
    y = alpha + factors.to_numpy() @ beta_vec + rng.normal(0.0, noise_sd, n)
    return pd.Series(y, index=idx, name="excess"), factors


@pytest.fixture
def make_panel():
    return _make_panel
