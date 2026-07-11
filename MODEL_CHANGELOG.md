# QScore Model Changelog

The displayed model version (`lib/scoring/model-version.ts`, shown on every
`/score` page) is bumped whenever scoring math, factor weights, signal
thresholds, universe definition, or metric applicability changes. This file
records what changed and when, so any historical snapshot in `data/snapshots/`
can be paired with the model that produced it.

Versioning policy: `v0.x` is pre-validation (model may change); `v1.x` is the
first stable release after the `/methodology#validation` backtest section is
filled in.

## v0.4 — 2026-07-11

**Industry-based metric applicability.** Metrics that are not economically
meaningful for a company's industry are now marked **"n/m"** and excluded from
the category average **and** the completeness denominator (so the company is not
penalized on confidence), instead of being z-scored and producing a misleading
number.

- **Banks** (`Banks - Diversified`, `Banks - Regional`): the following are
  n/m — **EV/EBITDA, FCF Yield, FCF Growth** (composite factors), and
  **Altman-Z, Net-Debt/EBITDA, Interest Coverage** (quality panel). These are
  enterprise-value / free-cash-flow / leverage constructs that misfire on a
  deposit-funded, book-value-driven balance sheet.
- Insurers and REITs are stubbed in the applicability map
  (`lib/scoring/applicability.ts`) for a later model iteration; their metrics are
  unchanged in v0.4.
- Behavior change: financial-sector composites and confidence labels move for
  bank names (they are no longer dragged down by nonsensical EV/EBITDA/FCF
  scores). See the PR description for the recomputed impact analysis (tickers
  changed, delta distribution, signal flips) computed offline from the latest
  committed snapshot inputs.

## v0.3 — May 2026

- Universe expanded from $15B large-cap to **$2B mid+large-cap**.
- Signal logic rounds before threshold comparison so displayed factor scores
  match the integer thresholds in `deriveSignal`.
- Daily snapshot filenames use US market close date, not UTC date.
