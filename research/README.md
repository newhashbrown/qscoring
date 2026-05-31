# QScoring backtest / validation harness (offline)

Offline factor-validation for the QScore. **Nothing here ships to the Worker** —
production scoring stays in Node/TS under `lib/scoring/`. This module reads
factor panels exported from the live scorer and runs standard factor analysis
(Information Coefficient, quantile spreads, turnover, IC decay, drawdown vs SPY).

It is a **hybrid**: a thin JS exporter reuses the *real* `lib/scoring` code so we
validate the actual scorer (no reimplementation drift); Python does the analysis
with audited libraries (`alphalens-reloaded`, `pyfolio-reloaded`) rather than
hand-rolled statistics.

## The firewall (read this first)

Panels carry a **provenance** that gates what they may be used for:

| provenance | how it's built | may be published / used for billing gate? |
|---|---|---|
| `forward` | flattened from `data/snapshots/*.json` — each score computed live that day | **yes** — point-in-time clean |
| `backward_diagnostic` | momentum + risk re-derived from truncated FMP price history | **no** — survivorship + stale-normalization bias |

`research/lib/panel.py` enforces this: `require_publishable()` hard-stops on a
non-forward panel, and every diagnostic output is stamped
`DIAGNOSTIC — NOT VALIDATION` with its bias tags. **Do not** route a backward
number into the methodology page, the IS/OOS split, or the billing-gate decision.

Why no backward *fundamentals* panel: FMP TTM ratios/growth are current-only and
restated, so they can't be made point-in-time. Backward re-derivation is limited
to price-path factors (momentum, risk); beta is excluded (FMP beta is a current
5-year figure, not as-of safe).

## Setup

```bash
python -m venv research/.venv
. research/.venv/bin/activate          # Windows: research\.venv\Scripts\activate
pip install -r research/requirements.txt
```

Versions are pinned because `alphalens-reloaded` / `pyfolio-reloaded` lag
numpy/pandas — use the venv, don't install globally.

## Run

**1. Export a panel** (writes to `research/data/`, gitignored). Needs `FMP_API_KEY` in `.env`:

```bash
# Forward / publishable (from committed snapshots):
npm run research:export -- --source snapshots --max-tickers 150

# Backward / diagnostic (momentum + risk only):
npm run research:export -- --source backward \
    --asof-start 2025-01-01 --asof-end 2026-05-01 --step 21 --max-tickers 60
```

**2. Analyze:**

```bash
# Publishable run (forward panel only — firewall enforced, runs IS/OOS):
python research/backtest.py \
  --panel research/data/factor_panel_snapshots.csv \
  --prices research/data/prices_snapshots.csv \
  --publishable --cost-bps 10 --out research/data/report_forward.json

# Diagnostic run (stamped DIAGNOSTIC, momentum/risk):
python research/backtest.py \
  --panel research/data/factor_panel_backward.csv \
  --prices research/data/prices_backward.csv --cost-bps 10
```

**3. Look-ahead gate** (run before trusting any result, and before Phase 2):

```bash
npm run research:lookahead
```

Asserts that price-path factor scores are unchanged when the most-recent 30 days
of input are truncated — i.e., they depend only on past data. Exit code 1 on any
mismatch.

## What it reports

Per factor, per 1/3/6/12-month horizon:
- **IC (Spearman)** mean + **IC-IR** (Grinold–Kahn information ratio = mean/std of IC)
- **Long-short quintile spread**, gross and **net of transaction costs** (turnover × bps)
- **Rolling-window IC** (tail), **IC decay** across horizons, **factor turnover**
- **Max drawdown + Sharpe vs SPY** on the long-short leg
- **In-sample / out-of-sample IC** (publishable panels only)

Young dataset: any horizon not yet covered by the panel window reports
`"available": false` rather than emitting a noise number. The forward panel needs
~21+ trading sessions before even the 1-month IC is meaningful — the honest state
until then is "accumulating."

## Known biases (always disclose alongside numbers)

- **Survivorship** — the FMP screener (`isActivelyTrading=true`) only includes
  current survivors; delisted names are absent. Worst for **Value** (value traps
  that went to zero are missing). Inflates any backward result.
- **Point-in-time fundamentals** — FMP TTM is as-restated-now → look-ahead in any
  backward fundamental factor (hence: not built).
- **Normalization drift** — backward scores z-score against *today's*
  `universe-stats.json`, not the as-of distribution.
- The **forward** panel avoids the look-ahead/normalization issues (scored live);
  its only residual is universe survivorship in the screened set.
