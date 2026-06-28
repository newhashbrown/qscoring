"""TDD: ExposureRecord -> flat row (the D1/persist contract)."""

from __future__ import annotations

import pytest

from factor_exposures.regression import ExposureRecord, FACTORS
from factor_exposures.serialize import _SUFFIX, record_to_row


def test_insufficient_record_has_null_stats_but_keeps_metadata():
    rec = ExposureRecord(
        ticker="AAA", n_obs=10, window_start="2020-01-31", window_end="2020-10-31",
        flags=["insufficient_history"],
    )
    row = record_to_row(rec, "2025-01-31")
    assert row["ticker"] == "AAA"
    assert row["snapshotDate"] == "2025-01-31"
    assert row["nObs"] == 10
    assert row["windowStart"] == "2020-01-31"
    assert row["styleLabel"] is None
    assert row["flags"] == ["insufficient_history"]
    # every beta/tstat/alpha column present but null
    for suffix in _SUFFIX.values():
        assert row[f"beta{suffix}"] is None
        assert row[f"tstat{suffix}"] is None
    assert row["alphaAnnualized"] is None
    assert row["r2"] is None


def test_full_record_maps_every_factor_to_flat_keys():
    rec = ExposureRecord(
        ticker="BBB", n_obs=60, window_start="2020-01-31", window_end="2024-12-31",
        flags=[], style_label="Defensive value",
        betas={f: 0.5 for f in FACTORS},
        tstats={f: 3.0 for f in FACTORS},
        alpha_monthly=0.001, alpha_annualized=0.012, alpha_tstat=2.5,
        r2=0.55, adj_r2=0.50,
    )
    row = record_to_row(rec, "2025-01-31")
    assert row["betaMktRf"] == 0.5
    assert row["tstatHml"] == 3.0
    assert row["alphaAnnualized"] == pytest.approx(0.012)
    assert row["alphaTstat"] == 2.5
    assert row["r2"] == 0.55
    assert row["adjR2"] == 0.50
    assert row["styleLabel"] == "Defensive value"
    # exactly the six beta + six tstat flat keys exist
    assert {k for k in row if k.startswith("beta")} == {f"beta{s}" for s in _SUFFIX.values()}
    assert {k for k in row if k.startswith("tstat")} == {f"tstat{s}" for s in _SUFFIX.values()}
