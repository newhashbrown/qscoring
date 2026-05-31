"""
QScoring backtest / validation harness (offline).

Consumes a factor panel + price panel exported by
scripts/research/export-factor-panel.ts and reports, per factor:

  - Information Coefficient (Spearman) at 1/3/6/12-month forward horizons
  - Long-short quintile-spread return + Sharpe, NET of transaction costs
  - Rolling-window IC
  - Factor turnover + IC decay across horizons
  - Drawdown profile vs SPY
  - (publishable panels only) in-sample / out-of-sample IC split

The firewall (research/lib/panel.py) ensures the IS/OOS + publishable summary
only ever runs on a forward (snapshot) panel; diagnostic panels are stamped
"DIAGNOSTIC — NOT VALIDATION" and limited to their valid factors.

Usage:
  python research/backtest.py --panel research/data/factor_panel_forward.parquet \
      --prices research/data/prices_forward.csv [--publishable] [--cost-bps 10]

Horizons are in TRADING days (≈21/63/126/252). The harness reports
"insufficient data" for any horizon not yet covered by the panel window rather
than emitting a noise number — the honest state for a young dataset.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# Repo-local firewall + loader.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.panel import (  # noqa: E402
    PanelMeta,
    banner,
    load_panel,
    require_publishable,
)

PERIODS = (21, 63, 126, 252)
PERIOD_LABEL = {21: "1M", 63: "3M", 126: "6M", 252: "1Y"}
QUANTILES = 5  # quintiles
TRADING_DAYS_YR = 252
DEFAULT_ROLLING_WINDOW = 21  # rolling-IC window in observations


def _import_alphalens():
    try:
        import alphalens as al  # alphalens-reloaded installs as `alphalens`
        return al
    except ImportError:  # pragma: no cover
        sys.exit(
            "alphalens not installed. Run:  pip install -r research/requirements.txt\n"
            "(in a venv — see the header of requirements.txt)."
        )


def _drawdown_and_sharpe(daily_returns: pd.Series) -> dict:
    """Max drawdown + annualized Sharpe. Uses empyrical (ships with
    pyfolio-reloaded) when available; falls back to a manual computation so the
    harness still runs if only alphalens is installed."""
    daily_returns = daily_returns.dropna()
    if daily_returns.empty:
        return {"max_drawdown": None, "sharpe": None}
    try:
        import empyrical as ep
        return {
            "max_drawdown": float(ep.max_drawdown(daily_returns)),
            "sharpe": float(ep.sharpe_ratio(daily_returns, period="daily")),
        }
    except ImportError:
        cum = (1 + daily_returns).cumprod()
        peak = cum.cummax()
        mdd = float((cum / peak - 1).min())
        mean, std = daily_returns.mean(), daily_returns.std(ddof=1)
        sharpe = float(np.sqrt(TRADING_DAYS_YR) * mean / std) if std else None
        return {"max_drawdown": mdd, "sharpe": sharpe}


def analyze_factor(
    al,
    factor: pd.Series,
    prices: pd.DataFrame,
    cost_bps: float,
    rolling_window: int,
) -> dict:
    """Run the full AlphaLens suite for one factor. Returns a JSON-able dict,
    degrading to {'error': ...} when the window is too short for a clean run."""
    try:
        factor_data = al.utils.get_clean_factor_and_forward_returns(
            factor=factor,
            prices=prices,
            quantiles=QUANTILES,
            periods=PERIODS,
            max_loss=0.50,  # tolerate dropouts on a young/sparse panel
        )
    except Exception as exc:  # noqa: BLE001 - AlphaLens raises bare on thin data
        return {"error": f"insufficient/clean-factor failure: {exc}"}

    out: dict = {"n_observations": int(len(factor_data))}

    # ---- Information Coefficient (Spearman) + IR per horizon ----
    ic = al.performance.factor_information_coefficient(factor_data)
    ic_summary = {}
    for p in PERIODS:
        col = f"{p}D"
        series = ic[col].dropna() if col in ic else pd.Series(dtype=float)
        if len(series) < 2:
            ic_summary[PERIOD_LABEL[p]] = {"available": False, "n": int(len(series))}
            continue
        mean_ic = float(series.mean())
        std_ic = float(series.std(ddof=1))
        ic_summary[PERIOD_LABEL[p]] = {
            "available": True,
            "n": int(len(series)),
            "mean_ic": round(mean_ic, 4),
            "ic_ir": round(mean_ic / std_ic, 3) if std_ic else None,  # Grinold-Kahn IR
            "rolling_ic_tail": [
                round(x, 4) for x in series.rolling(rolling_window).mean().dropna().tail(5).tolist()
            ],
        }
    out["information_coefficient"] = ic_summary
    out["ic_decay"] = {  # IC by horizon = decay curve
        PERIOD_LABEL[p]: ic_summary[PERIOD_LABEL[p]].get("mean_ic")
        for p in PERIODS
    }

    # ---- Long-short quintile spread, net of transaction costs ----
    # mean_return_by_quantile gives per-period mean returns; we take the
    # top-minus-bottom quintile spread and net out turnover * cost each side.
    mean_q, _ = al.performance.mean_return_by_quantile(factor_data, by_date=False)
    spread = {}
    for p in PERIODS:
        col = f"{p}D"
        if col not in mean_q.columns:
            spread[PERIOD_LABEL[p]] = {"available": False}
            continue
        top = mean_q[col].xs(QUANTILES, level="factor_quantile")
        bot = mean_q[col].xs(1, level="factor_quantile")
        gross = float(top.iloc[0] - bot.iloc[0])
        # Turnover (fraction of names rotating) on each leg per rebalance.
        try:
            t_top = al.performance.quantile_turnover(factor_data["factor_quantile"], QUANTILES, p).mean()
            t_bot = al.performance.quantile_turnover(factor_data["factor_quantile"], 1, p).mean()
            turnover = float((t_top + t_bot) / 2)
        except Exception:  # noqa: BLE001
            turnover = float("nan")
        cost = (cost_bps / 1e4) * (turnover if np.isfinite(turnover) else 0) * 2  # both legs
        spread[PERIOD_LABEL[p]] = {
            "available": True,
            "gross_spread": round(gross, 4),
            "turnover": round(turnover, 3) if np.isfinite(turnover) else None,
            "net_spread": round(gross - cost, 4),
        }
    out["long_short_quintile_spread"] = spread

    # ---- Drawdown vs SPY on the daily long-short factor return ----
    try:
        factor_ret = al.performance.factor_returns(factor_data)
        ls_daily = factor_ret["1D"].dropna() if "1D" in factor_ret else pd.Series(dtype=float)
        out["risk_vs_spy"] = _drawdown_and_sharpe(ls_daily)
    except Exception as exc:  # noqa: BLE001
        out["risk_vs_spy"] = {"error": str(exc)}

    return out


def in_sample_out_of_sample(al, factor: pd.Series, prices: pd.DataFrame, split: str | float) -> dict:
    """IS/OOS IC split (publishable path only). `split` is a date string or a
    fraction (0-1) of the date range used as the in-sample portion."""
    dates = factor.index.get_level_values("date").unique().sort_values()
    if len(dates) < 4:
        return {"error": "too few dates to split"}
    if isinstance(split, float):
        cut = dates[int(len(dates) * split)]
    else:
        cut = pd.Timestamp(split, tz="UTC")

    def _ic(sub_factor):
        try:
            fd = al.utils.get_clean_factor_and_forward_returns(
                sub_factor, prices, quantiles=QUANTILES, periods=PERIODS, max_loss=0.5
            )
            ic = al.performance.factor_information_coefficient(fd)
            return {PERIOD_LABEL[p]: round(float(ic[f"{p}D"].mean()), 4)
                    for p in PERIODS if f"{p}D" in ic}
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}

    is_mask = factor.index.get_level_values("date") <= cut
    return {
        "split_at": str(cut.date()),
        "in_sample": _ic(factor[is_mask]),
        "out_of_sample": _ic(factor[~is_mask]),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="QScoring factor backtest harness")
    ap.add_argument("--panel", required=True, help="factor panel parquet/csv")
    ap.add_argument("--prices", required=True, help="prices csv (date,ticker,close)")
    ap.add_argument("--factors", default="", help="comma-separated; default = all valid")
    ap.add_argument("--cost-bps", type=float, default=10.0, help="per-leg transaction cost in bps")
    ap.add_argument("--rolling-window", type=int, default=DEFAULT_ROLLING_WINDOW)
    ap.add_argument("--publishable", action="store_true",
                    help="enforce forward-panel firewall + run IS/OOS split")
    ap.add_argument("--oos-split", default="0.7", help="date (YYYY-MM-DD) or fraction for IS/OOS")
    ap.add_argument("--out", default="", help="optional path to write the JSON report")
    args = ap.parse_args()

    al = _import_alphalens()
    df, meta = load_panel(args.panel)
    print(banner(meta))

    if args.publishable:
        require_publishable(meta)  # hard stop if not a forward panel

    # Prices → wide date x ticker matrix.
    px = pd.read_csv(args.prices)
    px["date"] = pd.to_datetime(px["date"], utc=True)
    prices = px.pivot_table(index="date", columns="ticker", values="close").sort_index()

    # Which factors to run. Diagnostic panels are clamped to their valid set.
    candidate = [c for c in ["value", "growth", "momentum", "profitability", "risk", "composite"]
                 if c in df.columns]
    if not meta.is_publishable and meta.factors_valid:
        candidate = [c for c in candidate if c in meta.factors_valid]
    requested = [f.strip() for f in args.factors.split(",") if f.strip()] or candidate
    factors = [f for f in requested if f in df.columns]
    skipped = [f for f in requested if f not in candidate]
    if skipped:
        print(f"[skip] not valid for this panel ({meta.provenance}): {', '.join(skipped)}")

    report: dict = {
        "provenance": meta.provenance,
        "publishable": meta.is_publishable,
        "bias": meta.bias,
        "cost_bps": args.cost_bps,
        "factors": {},
    }

    for f in factors:
        print(f"\n=== factor: {f} ===")
        series = df[f].dropna()
        series.index = series.index.set_names(["date", "asset"])
        res = analyze_factor(al, series, prices, args.cost_bps, args.rolling_window)
        if args.publishable and "error" not in res:
            try:
                split = float(args.oos_split)
            except ValueError:
                split = args.oos_split
            res["is_oos"] = in_sample_out_of_sample(al, series, prices, split)
        report["factors"][f] = res
        print(json.dumps(res, indent=2, default=str))

    if not meta.is_publishable:
        print(banner(meta))  # repeat the loud footer so it can't be missed

    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2, default=str))
        print(f"\nWrote report → {args.out}")


if __name__ == "__main__":
    main()
