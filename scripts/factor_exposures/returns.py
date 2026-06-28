"""Price -> monthly excess-return transforms.

Input is a daily DIVIDEND+SPLIT-adjusted close series (FMP
/historical-price-eod/dividend-adjusted). Output is monthly total returns on a
PeriodIndex('M'), so it aligns cleanly with the Fama-French monthly calendar
(both sides converted to period 'M' — see factors.py)."""

from __future__ import annotations

import pandas as pd


def monthly_total_returns(adj_close: pd.Series) -> pd.Series:
    """Daily adjusted close -> monthly total returns at month-end.

    Resamples to the last available close in each calendar month, takes the
    percent change, and returns a PeriodIndex('M') series (first month dropped)."""
    monthly = adj_close.sort_index().resample("ME").last()  # month-end last close
    returns = monthly.pct_change().dropna()
    returns.index = returns.index.to_period("M")  # align to FF monthly calendar
    return returns


def to_excess(returns: pd.Series, rf: pd.Series) -> pd.Series:
    """Monthly returns minus the (same-calendar) risk-free rate, inner-joined."""
    joined = pd.concat(
        [returns.rename("r"), rf.rename("rf")], axis=1, join="inner"
    ).dropna()
    return (joined["r"] - joined["rf"]).rename("excess")
