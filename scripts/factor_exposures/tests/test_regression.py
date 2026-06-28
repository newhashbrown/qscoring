"""TDD: OLS factor regression + exposure-record builder."""

from __future__ import annotations

import numpy as np
import pytest

from factor_exposures.regression import (
    FACTORS,
    MIN_OBS,
    build_exposure_record,
    run_factor_regression,
)

KNOWN_BETAS = {
    "Mkt-RF": 1.10,
    "SMB": 0.30,
    "HML": -0.40,
    "RMW": 0.20,
    "CMA": -0.10,
    "MOM": 0.15,
}


def test_recovers_known_betas(make_panel):
    y, x = make_panel(120, KNOWN_BETAS, alpha=0.002, noise_sd=0.004, seed=42)
    res = run_factor_regression(y, x)
    for f in FACTORS:
        assert res.betas[f] == pytest.approx(KNOWN_BETAS[f], abs=0.02), f
    assert res.n_obs == 120
    assert 0.90 < res.r2 <= 1.0
    assert res.adj_r2 <= res.r2


def test_alpha_annualized_is_monthly_times_twelve(make_panel):
    y, x = make_panel(120, KNOWN_BETAS, alpha=0.002, noise_sd=0.004, seed=7)
    res = run_factor_regression(y, x)
    assert res.alpha_annualized == pytest.approx(res.alpha_monthly * 12)
    assert res.alpha_monthly == pytest.approx(0.002, abs=0.0025)


def test_alpha_tstat_is_not_annualized(make_panel):
    # alpha (~0.002) vs noise 0.004 over 120 obs => true |t| ~= 5. A bug that
    # multiplied the t-stat by 12 (mirroring the alpha annualization) would land
    # near ~60; this band catches that while accepting the honest value.
    y, x = make_panel(120, KNOWN_BETAS, alpha=0.002, noise_sd=0.004, seed=11)
    res = run_factor_regression(y, x)
    assert 2.0 < res.alpha_tstat < 12.0


def test_hac_tstats_present_and_finite(make_panel):
    y, x = make_panel(80, KNOWN_BETAS, alpha=0.001, noise_sd=0.006, seed=3)
    res = run_factor_regression(y, x)
    for f in FACTORS:
        assert np.isfinite(res.tstats[f]), f
    # Strong loadings should be clearly significant.
    assert abs(res.tstats["Mkt-RF"]) > 3.0


def test_aligns_on_index_and_drops_nan_rows(make_panel):
    y, x = make_panel(60, KNOWN_BETAS, alpha=0.0, noise_sd=0.004, seed=5)
    y = y.copy()
    y.iloc[:5] = np.nan  # 5 unusable rows
    res = run_factor_regression(y, x)
    assert res.n_obs == 55


def test_insufficient_history_record_is_unlabeled(make_panel):
    y, x = make_panel(MIN_OBS - 1, KNOWN_BETAS, seed=1)
    rec = build_exposure_record("AAA", y, x)
    assert "insufficient_history" in rec.flags
    assert rec.style_label is None
    assert rec.betas is None
    assert rec.alpha_annualized is None
    assert rec.n_obs == MIN_OBS - 1
    # window still reported from whatever history exists
    assert rec.window_start and rec.window_end


def test_sufficient_history_record_is_labeled(make_panel):
    y, x = make_panel(72, KNOWN_BETAS, alpha=0.002, noise_sd=0.004, seed=2)
    rec = build_exposure_record("BBB", y, x)
    assert "insufficient_history" not in rec.flags
    assert rec.betas is not None
    assert rec.style_label  # non-empty label
    assert rec.window_start == "2015-01-31"
    # 72 months from 2015-01 => last month is 2020-12
    assert rec.window_end == "2020-12-31"


def test_low_explanatory_power_flagged_but_still_labeled(make_panel):
    # Tiny loadings drowned in large noise => R^2 well below 0.10.
    weak = {f: 0.02 for f in FACTORS}
    y, x = make_panel(60, weak, alpha=0.0, noise_sd=0.5, seed=9)
    rec = build_exposure_record("CCC", y, x)
    assert rec.r2 < 0.10
    assert "low_explanatory_power" in rec.flags
    assert rec.style_label is not None  # obs minimum cleared => still labeled
