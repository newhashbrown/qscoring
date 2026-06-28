"""TDD: cleaned-universe loader + fund/share-class tripwire."""

from __future__ import annotations

import json

import pytest

from factor_exposures.universe import (
    DirtyUniverseError,
    assert_clean_universe,
    load_universe,
)


def test_passes_on_common_stocks():
    assert_clean_universe(
        [{"symbol": "AAPL", "name": "Apple Inc."}, {"symbol": "MSFT", "name": "Microsoft Corp"}]
    )


def test_does_not_false_positive_on_real_companies_with_funky_names():
    # IVZ (Invesco Ltd) and NTRS (Northern Trust) must survive — the issuer list
    # is narrow ('Invesco QQQ', not 'Invesco'; no bare 'Trust').
    assert_clean_universe(
        [
            {"symbol": "IVZ", "name": "Invesco Ltd."},
            {"symbol": "NTRS", "name": "Northern Trust Corporation"},
        ]
    )


def test_rejects_mutual_fund_share_class_ticker():
    with pytest.raises(DirtyUniverseError):
        assert_clean_universe(
            [{"symbol": "AAPL", "name": "Apple"}, {"symbol": "AAFTX", "name": "American Funds"}]
        )


def test_rejects_narrow_etf_issuer_name():
    with pytest.raises(DirtyUniverseError):
        assert_clean_universe([{"symbol": "TQQQ", "name": "ProShares UltraPro QQQ"}])


def test_accepts_bare_symbol_entries():
    assert_clean_universe(["AAPL", "MSFT"])


def test_load_universe_reads_symbols_in_order(tmp_path):
    p = tmp_path / "u.json"
    p.write_text(
        json.dumps(
            {"entries": [{"symbol": "AAPL", "name": "Apple"}, {"symbol": "MSFT", "name": "Microsoft"}]}
        )
    )
    assert load_universe(p) == ["AAPL", "MSFT"]


def test_load_universe_raises_on_dirty_file(tmp_path):
    p = tmp_path / "u.json"
    p.write_text(json.dumps({"entries": [{"symbol": "AAFTX", "name": "Some Fund"}]}))
    with pytest.raises(DirtyUniverseError):
        load_universe(p)
