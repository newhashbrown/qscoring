"""Fama-French factor-exposure batch job — orchestrator.

Pipeline (mirrors scripts/build-fundamentals.ts conventions: paced FMP reads,
per-ticker isolation, count summary, loud-on-total-failure exit):

  1. Load the cleaned universe from data/compare-universe.json (assert no fund
     artifacts — defense-in-depth for #62-63).
  2. Pull the FF 5-factor + Momentum monthly frame ONCE (pandas_datareader),
     keep the trailing 60-month window.
  3. Per ticker: pull FMP dividend+split-adjusted close, build monthly excess
     returns, regress (OLS + Newey-West HAC), classify the style.
  4. Write an append-only committed snapshot to data/factor-exposures/<date>.json.
  5. POST the rows to /api/cron/persist-factor-exposures (idempotent D1 upsert).

The Cloudflare Worker never runs any of this — it only reads the persisted rows.

Usage:
  python scripts/factor_exposures/run.py --max-tickers 5 --no-persist
  python scripts/factor_exposures/run.py --tickers AAPL,KO,NVDA --base http://127.0.0.1:8788
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

# Allow `python scripts/factor_exposures/run.py` (script mode) as well as
# `python -m factor_exposures.run` — mirror research/backtest.py's shim.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:  # Windows consoles default to cp1252 and choke on banner glyphs.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from factor_exposures.factors import fetch_factor_frame  # noqa: E402
from factor_exposures.regression import (  # noqa: E402
    HAC_LAGS,
    MIN_OBS,
    build_exposure_record,
)
from factor_exposures.returns import monthly_total_returns, to_excess  # noqa: E402
from factor_exposures.serialize import record_to_row  # noqa: E402
from factor_exposures.universe import load_universe  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
UNIVERSE_PATH = REPO_ROOT / "data" / "compare-universe.json"
SNAPSHOT_DIR = REPO_ROOT / "data" / "factor-exposures"

FMP_BASE = os.environ.get("FMP_BASE", "https://financialmodelingprep.com/stable")
DIVIDEND_ADJUSTED_PATH = "/historical-price-eod/dividend-adjusted"
# NOTE: dividend-adjusted (total-return) close — NOT /historical-price-eod/light,
# whose `price` is split-only (see lib/forward-returns.ts). 5y of dividends
# materially shift HML-loaded names, so the regression needs total returns.
ADJ_CLOSE_FIELDS = ("adjClose", "adjustedClose")

TRAILING_MONTHS = 60
# Pull a little more daily history than the window needs (month-end resampling +
# headroom) so the trailing 60-month regression is never short on its own data.
FETCH_LOOKBACK_DAYS = int((TRAILING_MONTHS + 12) * 30.5)
MODEL_VERSION = "ff6-v1"  # FF 5-factor (2x3) + Momentum, HAC(6)
REQUEST_TIMEOUT_SEC = 30
DEFAULT_GAP_SEC = 0.3  # ~200/min, under FMP's 300/min ceiling
PERSIST_PATH = "/api/cron/persist-factor-exposures"


def _fmp_symbol(symbol: str) -> str:
    """FMP uses '-' for share classes (BRK.B -> BRK-B)."""
    return symbol.replace(".", "-")


def fetch_adj_close(symbol: str, api_key: str) -> pd.Series:
    """Daily dividend+split-adjusted close as a datetime-indexed Series.
    Empty Series if the name has no usable history."""
    url = f"{FMP_BASE}{DIVIDEND_ADJUSTED_PATH}"
    from_date = (datetime.now(timezone.utc).date() - timedelta(days=FETCH_LOOKBACK_DAYS)).isoformat()
    resp = requests.get(
        url,
        params={"symbol": _fmp_symbol(symbol), "from": from_date, "apikey": api_key},
        timeout=REQUEST_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    payload = resp.json()
    rows = payload.get("historical", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list) or not rows:
        return pd.Series(dtype="float64")

    field = next((f for f in ADJ_CLOSE_FIELDS if f in rows[0]), None)
    if field is None:
        # Refuse to silently fall back to split-only `close`/`price`.
        raise ValueError(
            f"{symbol}: no adjusted-close field in {sorted(rows[0])[:8]} "
            f"(expected one of {ADJ_CLOSE_FIELDS})"
        )
    dates = pd.to_datetime([r["date"] for r in rows])
    values = pd.to_numeric(pd.Series([r[field] for r in rows]), errors="coerce")
    series = pd.Series(values.to_numpy(), index=dates).dropna()
    return series[~series.index.duplicated(keep="first")].sort_index()


def _parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Fama-French factor-exposure batch job")
    ap.add_argument("--max-tickers", type=int, default=0, help="0 = whole universe")
    ap.add_argument("--tickers", default="", help="comma list; overrides the universe")
    ap.add_argument("--base", default="", help="deploy base URL for persist (else $QSCORING_BASE)")
    ap.add_argument("--gap-seconds", type=float, default=DEFAULT_GAP_SEC)
    ap.add_argument("--no-persist", action="store_true", help="write snapshot only")
    ap.add_argument("--out", default="", help="override snapshot output path")
    return ap.parse_args()


def _persist(base: str, token: str, payload: dict) -> None:
    resp = requests.post(
        f"{base}{PERSIST_PATH}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=REQUEST_TIMEOUT_SEC,
    )
    if not resp.ok:
        raise RuntimeError(f"persist failed: {resp.status_code} {resp.text[:300]}")
    print(f"persisted -> {resp.status_code} {resp.text[:200]}")


def main() -> None:
    args = _parse_args()
    api_key = os.environ.get("FMP_API_KEY")
    if not api_key:
        sys.exit("FMP_API_KEY is not set — required to pull adjusted price history.")

    base = args.base or os.environ.get("QSCORING_BASE", "https://qscoring.com")
    token = os.environ.get("SNAPSHOT_CRON_TOKEN")

    symbols = (
        [s.strip().upper() for s in args.tickers.split(",") if s.strip()]
        if args.tickers
        else load_universe(UNIVERSE_PATH)
    )
    if args.max_tickers:
        symbols = symbols[: args.max_tickers]

    print(f"Pulling Fama-French factors (trailing {TRAILING_MONTHS}m)…")
    factors, rf = fetch_factor_frame()
    factors = factors.tail(TRAILING_MONTHS)
    rf = rf.loc[factors.index]
    window_end = factors.index.max()
    snapshot_date = window_end.to_timestamp(how="end").date().isoformat()
    window_start_iso = factors.index.min().to_timestamp(how="end").date().isoformat()
    print(
        f"FF window {window_start_iso} … {snapshot_date} "
        f"({len(factors)} months); scoring {len(symbols)} tickers."
    )

    rows: list[dict] = []
    scored = insufficient = skipped = failed = 0
    for i, symbol in enumerate(symbols, 1):
        try:
            prices = fetch_adj_close(symbol, api_key)
            if prices.empty:
                skipped += 1
                continue
            excess = to_excess(monthly_total_returns(prices), rf)
            record = build_exposure_record(symbol, excess, factors, min_obs=MIN_OBS)
            rows.append(record_to_row(record, snapshot_date))
            if "insufficient_history" in record.flags:
                insufficient += 1
            else:
                scored += 1
        except Exception as err:  # one bad name must never abort the run
            failed += 1
            print(f"  ! {symbol}: {type(err).__name__}: {err}")
        if args.gap_seconds:
            time.sleep(args.gap_seconds)
        if i % 50 == 0:
            print(f"  …{i}/{len(symbols)} (scored={scored} insf={insufficient})")

    snapshot = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "snapshotDate": snapshot_date,
        "modelVersion": MODEL_VERSION,
        "windowMonths": TRAILING_MONTHS,
        "minObs": MIN_OBS,
        "hacLags": HAC_LAGS,
        "factorWindowStart": window_start_iso,
        "factorWindowEnd": snapshot_date,
        "universeSize": len(symbols),
        "rows": rows,
    }

    out_path = Path(args.out) if args.out else SNAPSHOT_DIR / f"{snapshot_date}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(
        f"\nWrote {out_path} — rows={len(rows)} "
        f"(scored={scored} insufficient={insufficient} skipped={skipped} failed={failed})"
    )

    if token and not args.no_persist:
        _persist(base, token, {
            "snapshotDate": snapshot_date,
            "modelVersion": MODEL_VERSION,
            "rows": rows,
        })
    elif not args.no_persist:
        print("SNAPSHOT_CRON_TOKEN not set — snapshot written but NOT persisted.")

    # Loud failure: many attempts, nothing scored => almost certainly broken
    # (bad endpoint/field/key), not just a few delistings.
    if failed > 0 and scored == 0:
        sys.exit(f"All {failed} attempts failed and nothing scored — check FMP endpoint/key.")


if __name__ == "__main__":
    main()
