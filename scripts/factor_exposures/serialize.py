"""Serialize an ExposureRecord into the flat camelCase row shape that the
snapshot JSON stores and the /api/cron/persist-factor-exposures endpoint binds
straight into D1 columns. Keys here are the contract with the loader/migration.
"""

from __future__ import annotations

from factor_exposures.regression import ExposureRecord, FACTORS

# Factor key -> camelCase suffix (beta<Suffix> / tstat<Suffix>), matching the
# D1 columns (beta_mkt_rf, tstat_mkt_rf, ...).
_SUFFIX: dict[str, str] = {
    "Mkt-RF": "MktRf",
    "SMB": "Smb",
    "HML": "Hml",
    "RMW": "Rmw",
    "CMA": "Cma",
    "MOM": "Mom",
}

_BETA_DP = 6
_TSTAT_DP = 4
_STAT_DP = 4


def _round(value: float | None, dp: int) -> float | None:
    return None if value is None else round(float(value), dp)


def record_to_row(record: ExposureRecord, snapshot_date: str) -> dict:
    """Flat, JSON-serializable row. beta/tstat/alpha are None for an
    insufficient-history record (never a confident number for an unscored name)."""
    row: dict = {"ticker": record.ticker, "snapshotDate": snapshot_date}
    for factor, suffix in _SUFFIX.items():
        beta = None if record.betas is None else record.betas.get(factor)
        tstat = None if record.tstats is None else record.tstats.get(factor)
        row[f"beta{suffix}"] = _round(beta, _BETA_DP)
        row[f"tstat{suffix}"] = _round(tstat, _TSTAT_DP)
    row["alphaAnnualized"] = _round(record.alpha_annualized, _STAT_DP)
    row["alphaTstat"] = _round(record.alpha_tstat, _TSTAT_DP)
    row["r2"] = _round(record.r2, _STAT_DP)
    row["adjR2"] = _round(record.adj_r2, _STAT_DP)
    row["nObs"] = record.n_obs
    row["windowStart"] = record.window_start
    row["windowEnd"] = record.window_end
    row["styleLabel"] = record.style_label
    row["flags"] = list(record.flags)
    return row
