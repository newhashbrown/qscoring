"""TDD: style classification thresholds and phrasing."""

from __future__ import annotations

from factor_exposures.classify import UNCLASSIFIED, style_label

INSIG = 1.0  # below BETA_SIG_TSTAT (1.96)
SIG = 3.0


def _t(**overrides):
    base = {f: INSIG for f in ("Mkt-RF", "SMB", "HML", "RMW", "CMA", "MOM")}
    base.update(overrides)
    return base


def test_value_quality_defensive_phrase():
    betas = {"Mkt-RF": 0.8, "SMB": -0.1, "HML": 0.5, "RMW": 0.4, "CMA": 0.0, "MOM": 0.0}
    tstats = _t(**{"Mkt-RF": 5.0, "HML": 3.0, "RMW": 2.5})
    assert style_label(betas, tstats) == "Defensive quality value"


def test_all_dimensions_in_fixed_order():
    betas = {"Mkt-RF": 1.4, "SMB": 0.6, "HML": -0.3, "RMW": -0.2, "CMA": -0.3, "MOM": 0.4}
    tstats = _t(**{k: SIG for k in betas})
    assert (
        style_label(betas, tstats)
        == "High-beta small-cap junk growth aggressive momentum"
    )


def test_large_cap_and_reversal_antonyms():
    betas = {"Mkt-RF": 1.0, "SMB": -0.5, "HML": 0.0, "RMW": 0.0, "CMA": 0.0, "MOM": -0.3}
    tstats = _t(**{"SMB": SIG, "MOM": SIG})
    assert style_label(betas, tstats) == "Large-cap reversal"


def test_unclassified_when_nothing_significant():
    betas = {"Mkt-RF": 1.5, "SMB": 0.6, "HML": 0.6, "RMW": 0.6, "CMA": 0.6, "MOM": 0.6}
    assert style_label(betas, _t()) == UNCLASSIFIED


def test_market_boundary_one_is_defensive():
    betas = {"Mkt-RF": 1.0, "SMB": 0.0, "HML": 0.0, "RMW": 0.0, "CMA": 0.0, "MOM": 0.0}
    assert style_label(betas, _t(**{"Mkt-RF": 5.0})) == "Defensive"


def test_significance_gate_excludes_subthreshold():
    betas = {"Mkt-RF": 1.5, "SMB": 0.0, "HML": 0.9, "RMW": 0.0, "CMA": 0.0, "MOM": 0.0}
    # HML loads but its t (1.9) is below the 1.96 gate -> dropped.
    tstats = _t(**{"Mkt-RF": 4.0, "HML": 1.9})
    assert style_label(betas, tstats) == "High-beta"
