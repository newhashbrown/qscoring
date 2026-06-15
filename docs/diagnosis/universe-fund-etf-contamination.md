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

## Rollout plan (follow-up PR)

1. Wire `fetchUniverse`/`selectUniverse` into `build-strong-picks.ts`,
   `build-universe-stats.ts`, `build-sitemap-tickers.ts` (delete the three
   copy-pasted screener blocks).
2. Rebuild `data/universe-stats.json` from the cleaned universe **before** the
   next scoring run (scores are meaningless against the old contaminated
   corpus).
3. Verify the scoreboard sector mix lands near the 15.5% projection.
4. Spot-check that no real large-caps were dropped (REITs, BRK-B, etc.).
