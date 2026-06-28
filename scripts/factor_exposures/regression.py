"""OLS factor regression with Newey-West (HAC) standard errors, plus the
per-ticker exposure-record builder that applies the inclusion rules and flags.

This module is the testable statistical core. It is deliberately network-free:
it takes already-aligned excess returns and a factor frame and returns numbers.
Data fetching/alignment lives in returns.py / factors.py; orchestration in run.py.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
import statsmodels.api as sm

from factor_exposures.classify import style_label

# The six factors, in regression/storage order. Keys match the (normalized)
# columns produced by factors.py and the keys consumed by classify.py.
FACTORS: tuple[str, ...] = ("Mkt-RF", "SMB", "HML", "RMW", "CMA", "MOM")

# Inclusion rule: a name needs >= MIN_OBS aligned monthly observations to be
# scored; otherwise it is recorded as insufficient_history and never labeled.
MIN_OBS: int = 36

# Fit quality: R^2 below this is flagged low_explanatory_power (a quiet caveat,
# not an exclusion — the label still renders).
LOW_R2_THRESHOLD: float = 0.10

# Newey-West HAC lag count (months).
HAC_LAGS: int = 6

# Monthly -> annual alpha. (alpha_tstat is INVARIANT to this scaling and is
# reported as the raw const t-stat — do not multiply it by 12.)
MONTHS_PER_YEAR: int = 12


@dataclass(frozen=True)
class FactorRegressionResult:
    betas: dict[str, float]
    tstats: dict[str, float]
    alpha_monthly: float
    alpha_annualized: float
    alpha_tstat: float
    r2: float
    adj_r2: float
    n_obs: int


@dataclass(frozen=True)
class ExposureRecord:
    ticker: str
    n_obs: int
    window_start: str
    window_end: str
    flags: list[str]
    style_label: str | None = None
    betas: dict[str, float] | None = None
    tstats: dict[str, float] | None = None
    alpha_monthly: float | None = None
    alpha_annualized: float | None = None
    alpha_tstat: float | None = None
    r2: float | None = None
    adj_r2: float | None = None


def _align(excess_returns: pd.Series, factors: pd.DataFrame) -> pd.DataFrame:
    """Inner-join excess returns with the factor columns on their shared index
    and drop any row with a missing value. Index order is preserved/sorted."""
    joined = pd.concat(
        [excess_returns.rename("y"), factors[list(FACTORS)]],
        axis=1,
        join="inner",
    ).dropna()
    return joined.sort_index()


def run_factor_regression(
    excess_returns: pd.Series,
    factors: pd.DataFrame,
    hac_lags: int = HAC_LAGS,
) -> FactorRegressionResult:
    """OLS of excess_returns on the six factors + const, with HAC (Newey-West)
    standard errors. Inputs are inner-joined on their index and NaN rows dropped."""
    df = _align(excess_returns, factors)
    y = df["y"].to_numpy()
    x = sm.add_constant(df[list(FACTORS)].to_numpy())  # const is column 0
    fit = sm.OLS(y, x).fit(cov_type="HAC", cov_kwds={"maxlags": hac_lags})

    params, tvalues = fit.params, fit.tvalues
    betas = {f: float(params[i + 1]) for i, f in enumerate(FACTORS)}
    tstats = {f: float(tvalues[i + 1]) for i, f in enumerate(FACTORS)}
    alpha_monthly = float(params[0])

    return FactorRegressionResult(
        betas=betas,
        tstats=tstats,
        alpha_monthly=alpha_monthly,
        alpha_annualized=alpha_monthly * MONTHS_PER_YEAR,
        alpha_tstat=float(tvalues[0]),  # raw const t-stat — invariant to ×12
        r2=float(fit.rsquared),
        adj_r2=float(fit.rsquared_adj),
        n_obs=int(len(df)),
    )


def _window_bounds(index: pd.Index) -> tuple[str, str]:
    """First/last month-end (YYYY-MM-DD) of the aligned observation index."""
    per = index if isinstance(index, pd.PeriodIndex) else index.to_period("M")
    start = per.min().to_timestamp(how="end").date().isoformat()
    end = per.max().to_timestamp(how="end").date().isoformat()
    return start, end


def build_exposure_record(
    ticker: str,
    excess_returns: pd.Series,
    factors: pd.DataFrame,
    *,
    min_obs: int = MIN_OBS,
    hac_lags: int = HAC_LAGS,
) -> ExposureRecord:
    """Align, apply the observation-minimum gate, run the regression, attach
    flags (insufficient_history / low_explanatory_power) and the style label."""
    df = _align(excess_returns, factors)
    n = int(len(df))

    if n == 0:
        return ExposureRecord(
            ticker=ticker, n_obs=0, window_start="", window_end="",
            flags=["insufficient_history"],
        )

    window_start, window_end = _window_bounds(df.index)

    # Observation-minimum gate: below it we record the name as insufficient and
    # NEVER emit a confident label or betas.
    if n < min_obs:
        return ExposureRecord(
            ticker=ticker, n_obs=n, window_start=window_start, window_end=window_end,
            flags=["insufficient_history"],
        )

    res = run_factor_regression(df["y"], df[list(FACTORS)], hac_lags=hac_lags)
    flags: list[str] = []
    if res.r2 < LOW_R2_THRESHOLD:
        flags.append("low_explanatory_power")  # quiet caveat — still labeled

    return ExposureRecord(
        ticker=ticker,
        n_obs=res.n_obs,
        window_start=window_start,
        window_end=window_end,
        flags=flags,
        style_label=style_label(res.betas, res.tstats),
        betas=res.betas,
        tstats=res.tstats,
        alpha_monthly=res.alpha_monthly,
        alpha_annualized=res.alpha_annualized,
        alpha_tstat=res.alpha_tstat,
        r2=res.r2,
        adj_r2=res.adj_r2,
    )
