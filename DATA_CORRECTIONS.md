# Data Corrections Log

The QScore performance record is an append-only ledger of daily snapshots
committed to public source control (`data/snapshots/`). The record is
**tamper-evident, not immutable**: git is a public, cryptographically-chained
history, so any correction is itself a public commit that anyone can inspect and
diff. This file documents every correction applied to the snapshot ledger and
which snapshots are excluded from the forward-return / information-coefficient
cross-section, so the performance page's numbers can be reproduced exactly.

## 2026-06-12 — Fund / ETF share-class universe cleanup (issues #62, #63)

**What was wrong.** The screener that builds the scored universe was accepting
non-operating-company securities — mutual-fund share classes and ETFs — because
FMP's `isFund`/`isEtf` flags return `false` for many mutual-fund share classes
(e.g. tickers of the shape `XXXXX` ending in `X`: JMUEX, JUESX, AAFTX…). At its
peak roughly **half** of the "universe" was fund share classes, which distorted
the sector mix and every sector-relative z-score (a fund scored against
operating-company distributions is meaningless).

**What changed.**
- The universe selector now excludes fund/ETF rows by `isFund`/`isEtf` **and** by
  the mutual-fund ticker shape (`/^[A-Z]{4}X$/`) and known ETF-issuer names
  (`lib/scoring/universe.ts`), with a build-time tripwire (`assertNoFunds`).
- Contaminated daily snapshots from the pre-cleanup era were removed from the
  ledger, and the fund share classes were dropped from the D1 projection.

**Effect on the published record.**
- Snapshots dated **before 2026-06-12** contain the pre-cleanup universe and are
  **excluded from the information-coefficient cross-section** — the forward-return
  IC (`lib/forward-returns.ts`) only pairs snapshots from the clean universe, and
  the cohort gate (`MIN_COHORT_N = 600`) additionally excludes any thin or
  fund-contaminated era. The first clean full-universe cross-section begins
  **2026-06-12**; the first 1-month (21-trading-day) IC reading therefore lands
  in **mid-July 2026**.
- No score that was published on a given date was retroactively altered — the
  correction removed contaminated *rows/days* from the go-forward cross-section;
  the original commits remain in git history for audit.

## 2026-07-11 — Model v0.4: bank metric applicability

Not a data correction, but recorded here for completeness since it changes
published scores for one sector. Metrics that are not meaningful for banks
(EV/EBITDA, FCF yield/growth, Altman-Z, net-debt/EBITDA, interest coverage) are
now marked "n/m" and excluded from the composite rather than scored. See
[`MODEL_CHANGELOG.md`](./MODEL_CHANGELOG.md). Snapshots before the v0.4 effective
date carry v0.3 bank composites; the `model_version` field on each snapshot
disambiguates.
