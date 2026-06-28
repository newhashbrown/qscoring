"""Fama-French factor data: fetch via pandas_datareader, then normalize/align.

get_data_famafrench returns a DICT of tables; the MONTHLY table is key [0] (an
annual table is [1] — select deliberately). Values are in PERCENT (divide by
100). The index is a PeriodIndex(freq='M'); momentum column names carry trailing
whitespace ('Mom '). RF lives in the 5-factor frame and is already aligned — we
read it from there rather than sourcing it separately.

build_factor_frame() (pure, unit-tested) does the normalization; fetch_factor_frame()
is the thin network wrapper exercised only end-to-end.
"""

from __future__ import annotations

import pandas as pd

from factor_exposures.regression import FACTORS

FF_5F_DATASET = "F-F_Research_Data_5_Factors_2x3"
FF_MOM_DATASET = "F-F_Momentum_Factor"

# Index of the monthly table within the get_data_famafrench result dict.
MONTHLY_TABLE = 0

# Percent -> decimal.
PERCENT = 100.0


def build_factor_frame(
    raw_5f: pd.DataFrame, raw_mom: pd.DataFrame
) -> tuple[pd.DataFrame, pd.Series]:
    """Normalize the raw monthly FF tables and return (factors, rf), both in
    decimal units on a shared PeriodIndex('M').

    - strips whitespace from all column names (handles 'Mom ')
    - renames momentum 'Mom' -> 'MOM'
    - divides by 100 (percent -> decimal)
    - inner-joins the 5-factor and momentum frames on month
    - returns factors[FACTORS] and the RF series (from the 5-factor frame)
    """
    five = raw_5f.rename(columns=lambda c: str(c).strip()) / PERCENT
    mom = raw_mom.rename(columns=lambda c: str(c).strip()) / PERCENT
    mom = mom.rename(columns={"Mom": "MOM"})

    # Both tables come back on a PeriodIndex('M'); coerce defensively in case a
    # DatetimeIndex ever slips through, so the join is always period-on-period.
    if not isinstance(five.index, pd.PeriodIndex):
        five.index = five.index.to_period("M")
    if not isinstance(mom.index, pd.PeriodIndex):
        mom.index = mom.index.to_period("M")

    joined = pd.concat([five, mom["MOM"]], axis=1, join="inner").sort_index()
    return joined[list(FACTORS)], joined["RF"]


def fetch_factor_frame(start=None, end=None) -> tuple[pd.DataFrame, pd.Series]:
    """Network wrapper: pull both FF datasets and hand the monthly tables to
    build_factor_frame. Not unit-tested (exercised in the end-to-end run)."""
    import warnings

    from pandas_datareader.data import get_data_famafrench

    # pandas_datareader passes the deprecated `date_parser` to read_csv; the
    # warning is internal to the library and not actionable here.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        raw_5f = get_data_famafrench(FF_5F_DATASET, start=start, end=end)[MONTHLY_TABLE]
        raw_mom = get_data_famafrench(FF_MOM_DATASET, start=start, end=end)[MONTHLY_TABLE]
    return build_factor_frame(raw_5f, raw_mom)
