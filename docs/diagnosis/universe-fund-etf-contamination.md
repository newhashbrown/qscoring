# Diagnosis: fund/ETF contamination of the scored universe

**Status:** proposed fix (`lib/scoring/universe.ts`) — NOT yet wired into call sites.
**Date:** 2026-06-15

## Symptom

The production scoreboard's sector mix is implausible for a US >$2B equity
universe:

| Sector | Share of scored universe (799 names) |
|---|---|
| **Financial Services** | **60.2% (481)** |
| Technology | 9.5% (76) |
| Industrials | 7.0% (56) |
| Healthcare | 5.3% (42) |
| …all others | < 18% combined |

A real US large/mid-cap universe runs ~13–15% Financial Services, not 60%.

## Root cause

The screener query in `build-strong-picks.ts` (and the copy-pasted variants in
`build-universe-stats.ts` / `build-sitemap-tickers.ts`) does **not exclude
funds or ETFs**, and caps at `limit=800` — so funds eat half the slots before
real equities are reached.

Measured against FMP `/company-screener` with the **current** params
(`marketCapMoreThan=2e9, country=US, exchange=NASDAQ,NYSE, limit=800`, no type
filter):

| Bucket | Count | Share |
|---|---|---|
| **isFund** (mutual-fund share classes) | **400** | **50.0%** |
| **isEtf** | 28 | 3.5% |
| **Real equities** | 372 | **46.5%** |

So **~53% of the "scored universe" is funds/ETFs** — JPMorgan U.S. Equity Fund,
the American Funds target-date series, etc. FMP classifies these as "Financial
Services," which is exactly the 60% bulge above. They carry no fundamentals,
yet still receive composite scores and emit BUY/HOLD signals, and they poison
the z-score normalization corpus that every real ticker is scored against.

### Corroborating evidence (independent)

The Phase 2 fundamentals capture run (2026-06-15) over the same universe wrote
rows for only **395 / ~800 tickers (~49%)** — the other ~51% returned no income
statement, because funds/ETFs don't file them. Two unrelated pipelines agree on
the ~50% contamination figure.

## Proposed fix — `lib/scoring/universe.ts`

A single source of truth for the investable universe:

- Excludes `isEtf` / `isFund` **at the screener query** and again in
  `selectUniverse` as defense-in-depth.
- Fetches **deep** (`limit=3000`, ~1,693 real equities exist >$2B) and caps to
  800 **after** exclusions — so the result is the top-800 *real* equities by
  market cap, not 800-minus-funds.
- Uses FMP's `isEtf`/`isFund` flags as the only discriminator — deliberately
  **no** name-pattern heuristics (those wrongly delete real large-caps:
  Digital Realty, Federal Realty, Strategy Inc).
- Pure `selectUniverse` core is unit-tested (`universe.test.ts`).

### Projected impact

Re-running the screener with the filter (`isEtf=false, isFund=false,
limit=3000`) and taking the top 800 brings **Financial Services to 15.5%** —
a realistic distribution. The universe gains ~420 real equities currently
crowded out by funds, and loses the ~430 funds/ETFs.

## Why this is its own PR (not folded into the /score enrichment work)

Adopting this **changes which ~800 names get scored**, which:
- shifts the z-score normalization corpus (every factor score moves),
- changes scoreboard / strong-picks / category pages / movers,
- needs the `universe-stats` corpus rebuilt in lockstep.

That is a deliberate, reviewable production change with its own blast radius —
hence this diagnosis first, then a follow-up implementation PR that wires
`universe.ts` into the three call sites and rebuilds `universe-stats`.

## Rollout

Wired in the follow-up PR. Scope correction: only **two** call sites needed
the change — `build-strong-picks.ts` (scorer) and `build-universe-stats.ts`
(corpus). `build-sitemap-tickers.ts` was left untouched: it **already**
excludes `isEtf`/`isFund`, and deliberately uses a $250M floor + name
heuristics for broad SEO coverage — a different, correct design the scored-
universe selector must not impose.

Both scorer and corpus now call the identical
`fetchUniverse({ maxSize: 800, requireSector: true })`, so they cannot drift.
Verified live: 800 real equities, Financial Services **15.5%**, REITs retained
(Real Estate 6%), top caps NVDA/GOOGL/AAPL/MSFT.

### Deploy runbook (lockstep — corpus before scorer)

The corpus must be rebuilt from the cleaned universe **before** the scorer runs
against it, or scores are computed against the old contaminated distribution.
The crons already order this (universe-stats 02:00 UTC < strong-picks 09:30
UTC), so it self-heals within one cycle — but for a clean cutover with no
transition-day glitch, after merge:

1. Manually dispatch **refresh-universe-stats** → rebuilds
   `data/universe-stats.json` from the cleaned universe.
2. Then dispatch **refresh-strong-picks** (or wait for 09:30 UTC) → scores the
   cleaned universe against the fresh corpus.
3. Verify the scoreboard sector mix lands near the 15.5% projection and spot-
   check no real large-caps were dropped (REITs, BRK-B, GOOG/GOOGL, etc.).
