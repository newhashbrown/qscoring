# Factor exposures — Fama-French regression batch job

Per-stock Fama-French factor exposures for the cleaned QScore universe. Monthly
OLS of each name's monthly **excess** returns on the FF 5-factor (2×3) +
Momentum factors, with **Newey-West (HAC)** standard errors. Results are written
as an append-only committed JSON snapshot and loaded into D1; the Cloudflare
Worker only ever **reads** the precomputed rows (heavy compute never touches a
request path).

Python (statsmodels) does the statistics with audited libraries rather than
hand-rolled OLS/HAC, mirroring `research/`.

## Defaults

| Knob | Value |
|---|---|
| Return frequency | monthly |
| Trailing window | 60 months |
| Min observations to score | 36 (else `insufficient_history`) |
| Factors | Mkt-RF, SMB, HML, RMW, CMA, MOM |
| Standard errors | Newey-West (HAC), 6 lags |
| Alpha | reported annualized (monthly α × 12); its t-stat is the raw const t (not scaled) |
| Low-fit flag | R² < 0.10 → `low_explanatory_power` |

## Data sources

- **Factors:** `pandas_datareader.get_data_famafrench` —
  `F-F_Research_Data_5_Factors_2x3` + `F-F_Momentum_Factor` (monthly tables,
  percent units ÷100, RF read from the 5-factor frame). Both aligned to the FF
  month-end calendar via `to_period('M')`.
- **Prices:** FMP `/historical-price-eod/dividend-adjusted` (`adjClose`) — total
  returns (dividend **and** split adjusted), not the split-only `light` close.
- **Universe:** committed `data/compare-universe.json` (already cleaned by
  `lib/scoring/universe.ts`); `assert_clean_universe` re-checks for fund/share-class
  artifacts as defense-in-depth (issues #62–63).

## Setup

```bash
py -3 -m venv scripts/factor_exposures/.venv
scripts/factor_exposures/.venv/Scripts/python.exe -m pip install -r scripts/factor_exposures/requirements.txt  # Windows
# POSIX: python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
```

## Run

```bash
# Whole universe -> snapshot + D1 (needs FMP_API_KEY; SNAPSHOT_CRON_TOKEN to persist):
python scripts/factor_exposures/run.py

# A few names, snapshot only, no persist:
python scripts/factor_exposures/run.py --tickers KO,NVDA,AAPL --no-persist --out /tmp/ff.json

# Local/preview persist (never prod) for verification:
python scripts/factor_exposures/run.py --max-tickers 10 --base http://127.0.0.1:8788
```

## Test

```bash
cd scripts && python -m pytest factor_exposures/tests -q
```

Unit tests cover regression β-recovery on synthetic data, the style-classifier
thresholds, FF normalization/alignment, return transforms, the universe tripwire,
and the D1 serialization contract. The CI workflow
(`.github/workflows/refresh-factor-exposures.yml`) runs them as a gate before the
monthly job.

## Storage

- Snapshot: `data/factor-exposures/<window-end>.json` (append-only, committed).
- D1: `factor_exposures` (`migrations/0009_factor_exposures.sql`), keyed
  `(ticker, snapshot_date)`; loaded via `/api/cron/persist-factor-exposures`.
- Read path: `lib/scoring/factor-exposures.ts` → `/api/factors/[ticker]` and the
  `FactorProfile` section on the stock page.
