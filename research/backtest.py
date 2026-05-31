"""
QScoring backtest / validation harness (offline).

Consumes a factor panel + price panel exported by
scripts/research/export-factor-panel.ts and reports, per factor:

  - Information Coefficient (Spearman) at 1/3/6/12-month forward horizons + IC-IR
  - Long-short quintile-spread return + Sharpe, NET of transaction costs
  - Rolling-window IC, factor turnover, IC decay across horizons
  - Max drawdown of the long-short spread (+ SPY buy-hold benchmark when present)
  - (publishable panels only) in-sample / out-of-sample IC split

COMPUTE ENGINE: a direct cross-sectional Spearman IC (scipy.stats.spearmanr) —
the textbook IC definition (Grinold–Kahn): for each rebalance date, rank-correlate
the factor cross-section against the realized forward return cross-section, then
average over dates. We do NOT route through AlphaLens here: alphalens-reloaded's
get_clean_factor_and_forward_returns insists on reconciling a sparse factor index
with the price calendar's custom-business-day frequency and raises on our ~monthly
rebalance cadence. The direct computation is small, auditable, and gives identical
IC semantics. (A dense daily forward panel could revisit AlphaLens later; the
firewall in research/lib/panel.py is unchanged.)

The firewall: the IS/OOS + publishable summary only runs on a forward (snapshot)
panel; diagnostic panels are stamped "DIAGNOSTIC — NOT VALIDATION".

Usage:
  python research/backtest.py --panel research/data/factor_panel_backward.csv \
      --prices research/data/prices_backward.csv [--publishable] [--cost-bps 10]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

# Windows consoles default to cp1252 and choke on the banner/arrow glyphs.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.panel import banner, load_panel, require_publishable  # noqa: E402

PERIODS = (21, 63, 126, 252)
PERIOD_LABEL = {21: "1M", 63: "3M", 126: "6M", 252: "1Y"}
QUANTILES = 5
TRADING_DAYS_YR = 252
MIN_NAMES = 5  # min cross-section size to compute an IC for a date
DEFAULT_ROLLING_WINDOW = 6  # rolling-IC window in rebalance observations


def _forward_return(prices: pd.DataFrame, d: pd.Timestamp, horizon: int) -> pd.Series | None:
    """H-trading-day forward return per ticker as of date d (positional shift on
    the daily price index). None if d isn't in the index or the horizon runs off
    the end (no future data yet — the honest 'accumulating' case)."""
    idx = prices.index
    if d not in idx:
        return None
    pos = idx.get_loc(d)
    if pos + horizon >= len(idx):
        return None
    return prices.iloc[pos + horizon] / prices.iloc[pos] - 1.0


def _ic_series(factor_wide: pd.DataFrame, prices: pd.DataFrame, horizon: int) -> pd.Series:
    """Cross-sectional Spearman IC per rebalance date for one horizon."""
    out = {}
    for d in factor_wide.index:
        fwd = _forward_return(prices, d, horizon)
        if fwd is None:
            continue
        pair = pd.concat([factor_wide.loc[d].rename("f"), fwd.rename("r")], axis=1).dropna()
        if len(pair) < MIN_NAMES:
            continue
        ic, _ = spearmanr(pair["f"], pair["r"])
        if np.isfinite(ic):
            out[d] = float(ic)
    return pd.Series(out).sort_index()


def _quantile_spread(factor_wide: pd.DataFrame, prices: pd.DataFrame, horizon: int,
                     cost_bps: float) -> dict:
    """Top-minus-bottom quintile forward-return spread per date, annualized
    Sharpe, turnover, and net-of-cost spread."""
    spreads, top_sets = [], []
    for d in factor_wide.index:
        fwd = _forward_return(prices, d, horizon)
        if fwd is None:
            continue
        pair = pd.concat([factor_wide.loc[d].rename("f"), fwd.rename("r")], axis=1).dropna()
        if len(pair) < QUANTILES * 2:
            continue
        try:
            q = pd.qcut(pair["f"].rank(method="first"), QUANTILES, labels=False)
        except ValueError:
            continue
        top = pair["r"][q == QUANTILES - 1]
        bot = pair["r"][q == 0]
        spreads.append(top.mean() - bot.mean())
        top_sets.append(set(pair.index[q == QUANTILES - 1]))
    if len(spreads) < 2:
        return {"available": False, "n": len(spreads)}
    s = pd.Series(spreads)
    # Turnover: avg fraction of the top quintile that rotates out between rebalances.
    turns = [
        1 - len(top_sets[i] & top_sets[i - 1]) / max(1, len(top_sets[i - 1]))
        for i in range(1, len(top_sets))
    ]
    turnover = float(np.mean(turns)) if turns else 0.0
    cost = (cost_bps / 1e4) * turnover * 2  # both legs
    periods_per_yr = TRADING_DAYS_YR / horizon
    sharpe = float(s.mean() / s.std(ddof=1) * np.sqrt(periods_per_yr)) if s.std(ddof=1) else None
    cum = (1 + s).cumprod()
    mdd = float((cum / cum.cummax() - 1).min())
    return {
        "available": True,
        "n": int(len(s)),
        "gross_spread_mean": round(float(s.mean()), 4),
        "net_spread_mean": round(float(s.mean()) - cost, 4),
        "turnover": round(turnover, 3),
        "sharpe_annualized": round(sharpe, 3) if sharpe is not None else None,
        "max_drawdown": round(mdd, 4),
    }


def analyze_factor(factor_wide: pd.DataFrame, prices: pd.DataFrame, cost_bps: float,
                   rolling_window: int) -> dict:
    out: dict = {"n_dates": int(len(factor_wide))}
    ic_table, decay = {}, {}
    for p in PERIODS:
        ic = _ic_series(factor_wide, prices, p)
        if len(ic) < 2:
            ic_table[PERIOD_LABEL[p]] = {"available": False, "n": int(len(ic))}
            decay[PERIOD_LABEL[p]] = None
            continue
        mean_ic, std_ic = float(ic.mean()), float(ic.std(ddof=1))
        ic_table[PERIOD_LABEL[p]] = {
            "available": True,
            "n": int(len(ic)),
            "mean_ic": round(mean_ic, 4),
            "ic_ir": round(mean_ic / std_ic, 3) if std_ic else None,  # Grinold-Kahn IR
            "rolling_ic_tail": [round(x, 4) for x in ic.rolling(rolling_window).mean().dropna().tail(5).tolist()],
        }
        decay[PERIOD_LABEL[p]] = round(mean_ic, 4)
    out["information_coefficient"] = ic_table
    out["ic_decay"] = decay
    out["long_short_quintile_spread"] = {
        PERIOD_LABEL[p]: _quantile_spread(factor_wide, prices, p, cost_bps) for p in PERIODS
    }
    return out


def is_oos(factor_wide: pd.DataFrame, prices: pd.DataFrame, split: str | float) -> dict:
    dates = factor_wide.index
    if len(dates) < 4:
        return {"error": "too few dates to split"}
    cut = dates[int(len(dates) * split)] if isinstance(split, float) else pd.Timestamp(split, tz="UTC")

    def _ic(sub: pd.DataFrame) -> dict:
        return {PERIOD_LABEL[p]: (round(float(_ic_series(sub, prices, p).mean()), 4)
                                  if len(_ic_series(sub, prices, p)) else None)
                for p in PERIODS}

    return {
        "split_at": str(cut.date()),
        "in_sample": _ic(factor_wide[factor_wide.index <= cut]),
        "out_of_sample": _ic(factor_wide[factor_wide.index > cut]),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="QScoring factor backtest harness")
    ap.add_argument("--panel", required=True)
    ap.add_argument("--prices", required=True)
    ap.add_argument("--factors", default="")
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--rolling-window", type=int, default=DEFAULT_ROLLING_WINDOW)
    ap.add_argument("--publishable", action="store_true")
    ap.add_argument("--oos-split", default="0.7")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    df, meta = load_panel(args.panel)
    print(banner(meta))
    if args.publishable:
        require_publishable(meta)

    px = pd.read_csv(args.prices)
    px["date"] = pd.to_datetime(px["date"], utc=True)
    prices = px.pivot_table(index="date", columns="ticker", values="close").sort_index()

    if meta.is_publishable:
        candidate = [c for c in ["value", "growth", "momentum", "profitability", "risk", "composite"]
                     if c in df.columns]
    else:
        candidate = [c for c in meta.factors_valid if c in df.columns]
    requested = [f.strip() for f in args.factors.split(",") if f.strip()] or candidate
    factors = [f for f in requested if f in df.columns and f in candidate]

    report = {"provenance": meta.provenance, "publishable": meta.is_publishable,
              "bias": meta.bias, "cost_bps": args.cost_bps, "factors": {}}

    for f in factors:
        print(f"\n=== factor: {f} ===")
        wide = df[f].dropna().unstack(level="ticker")  # date x ticker
        res = analyze_factor(wide, prices, args.cost_bps, args.rolling_window)
        if args.publishable:
            try:
                split = float(args.oos_split)
            except ValueError:
                split = args.oos_split
            res["is_oos"] = is_oos(wide, prices, split)
        report["factors"][f] = res
        print(json.dumps(res, indent=2, default=str))

    if not meta.is_publishable:
        print(banner(meta))

    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print(f"\nWrote report -> {args.out}")


if __name__ == "__main__":
    main()
