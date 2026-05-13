# QScoring — Architecture Audit

_Generated 2026-05-13 from a read-only walk of `~/qscoring`._

## 1. What QScoring is

QScoring is a marketing + waitlist site that exposes a public **Quant Score** for any US-listed equity. A user types a ticker, the site returns a composite 0–100 score, a buy/hold/short signal, a confidence label, and per-category breakdowns (value, growth, momentum, profitability, risk). The site also runs a follow-the-tickers email loop (watchlists with signal-flip alerts), weekly forward-track recaps for public accountability, and an "analyze my portfolio" tool.

The product is currently waitlist-stage ("Launching Summer 2026"). Conversions land in a Cloudflare D1 `subscribers` table; emails are sent through Resend.

## 2. Runtime topology

```
                    ┌────────────────────────────┐
   User browser ──► │ Cloudflare Workers (edge)  │
                    │  OpenNext build of Next 16 │
                    └────────┬─────────┬─────────┘
                             │         │
                       cf.env.DB   cf.env.ASSETS
                             │         │
                    ┌────────▼──┐  ┌───▼─────────┐
                    │   D1      │  │ Static      │
                    │ qscoring- │  │ assets      │
                    │   db      │  └─────────────┘
                    └────────┬──┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
   subscribers       watchlist_entries        fmp_cache
   (waitlist)        (per-user follows)       (stale-while-error)

   Out-of-band integrations (server-side fetch only):
     • FMP   — financialmodelingprep.com/stable/*   (fundamentals + prices)
     • Resend — api.resend.com/emails               (transactional email)
     • Cloudflare AI binding (`AI`)                  (reserved; not yet wired)
```

- **Build:** `next build` → `@opennextjs/cloudflare` adapter → `.open-next/worker.js` deployed by Workers Builds.
- **Worker config:** [`wrangler.jsonc`](../../wrangler.jsonc) — `nodejs_compat`, `global_fetch_strictly_public`, D1 binding `DB`, asset binding `ASSETS`, AI binding `AI`, observability enabled.
- **Where it runs:** must be deployed from WSL Ubuntu (Node 22) — Windows OpenNext + `@vercel/og` wasm bug is documented in user memory.

## 3. Repository layout

```
app/                  Next.js App Router surface
  api/                Edge route handlers (waitlist, scoring, watchlist, search, cron, portfolio)
  blog/               Editorial pages — methodology, comparisons, factor investing, recaps
  compare/            Pairwise ticker comparison
  score/, scores/     Per-ticker score page + category leaderboards
  glossary/           Glossary cluster pages
  portfolio/          Portfolio analyzer
  performance/        Public forward-track performance page
  sitemap-*.xml/      Multiple sitemap surfaces (core, longtail, blog, glossary, compare, static, categories)
  components/         Cross-page React components
lib/
  scoring/            Score engine (z-score → composite, FMP client, momentum, cache)
  commentary/         AI commentary prompts + fallback
  email/              Resend wrapper + templates (welcome, admin notify, watchlist confirm, watchlist alert)
  feature-flags.ts    Binary site-wide toggles
  performance.ts      Recap aggregation helpers
  portfolio.ts        Pure-function portfolio analyzer
  recaps.ts           Weekly recap analysis (start vs end snapshot)
  compare.ts          Compare-page data shaping
  sitemap/xml.ts      XML sitemap builder
  market-date.ts      Market-day arithmetic
migrations/           D1 schema (subscribers, watchlist, fmp_cache)
scripts/              tsx batch jobs run from GitHub Actions
data/                 Locked snapshots and curated universe data committed to repo
public/               Static assets
.github/workflows/    Three scheduled jobs (universe stats, strong picks, weekly recap)
```

## 4. Core domain: the Quant Score

The scoring pipeline lives entirely in [`lib/scoring/`](../../lib/scoring/) and is the auditable surface of the product.

### 4.1 Data fetched per ticker

For every `/api/score/[ticker]` request, [`fetchTickerData()`](../../lib/scoring/score.ts) issues six parallel FMP `/stable/*` calls behind the cache layer:

| Field        | FMP endpoint        | TTL (seconds) |
| ------------ | ------------------- | ------------- |
| `profile`    | profile             | 86 400 (24h)  |
| `quote`      | quote               | 900 (15m)     |
| `ratiosTtm`  | ratios-ttm          | 86 400 (24h)  |
| `km`         | key-metrics-ttm     | 86 400 (24h)  |
| `growth`     | financial-growth    | 86 400 (24h)  |
| `history`    | historical-price    | 21 600 (6h)   |

TTLs are tuned to update cadence: intraday quotes refresh every 15 min, EOD prices once per close, fundamentals only quarterly. The previous uniform 15-min TTL repeatedly blew through FMP's 300 req/min ceiling.

### 4.2 Stale-while-error cache

[`lib/scoring/fmp-cache.ts`](../../lib/scoring/fmp-cache.ts) layers a D1-backed cache (`fmp_cache` table, `cache_key` primary key) on top of the live FMP fetch:

- **Happy path** — live fetch succeeds, payload written through `ctx.waitUntil()` so the response returns before the D1 commit.
- **Transient failure** (429-exhausted, 5xx, network) — caller reads the last-known-good payload from D1 and records the staleness via `recordStale()`.
- **Hard failure** (`FmpUnavailableError`: 402 not-in-plan, 404 missing) — bubbles to caller; no fallback. These produce user-facing errors at the score API.
- **Staleness surfacing** — `withStalenessTracking()` runs the score pipeline inside an `AsyncLocalStorage` scope; the oldest `fetchedAt` of any cache hit is returned on the `ScoreResult.staleSince` field for UI display.

### 4.3 Z-score normalization

[`lib/scoring/zscore.ts`](../../lib/scoring/zscore.ts) replaces a former heuristic piecewise mapping. Each metric becomes a z-score against a reference distribution (sector if `size >= 15`, else universe-wide), then maps `z = 0 → 50`, `z = ±3 → 0/100`, clipped at the extremes.

Distribution stats are loaded statically from [`data/universe-stats.json`](../../data/universe-stats.json), rebuilt nightly at 02:00 UTC by `refresh-universe-stats.yml` against an ~800-ticker universe.

### 4.4 Composite signal logic

[`lib/scoring/score.ts`](../../lib/scoring/score.ts) computes a long-horizon and short-horizon composite from per-category z-scores using fixed weights:

| Category       | Long weight | Short weight |
| -------------- | ----------- | ------------ |
| value          | 0.30        | 0.10         |
| growth         | 0.20        | 0.15         |
| profitability  | 0.25        | 0.10         |
| momentum       | 0.05        | 0.40         |
| risk           | 0.20        | 0.25         |

`deriveSignal(longScore, shortScore, momentum)` rounds inputs first (so the threshold checks match what the UI shows):

- `lt < 30 || st < 30` → `SHORT`
- `st >= 65 && mom >= 60` → `BUY_SHORT_TERM`
- `lt >= 70` → `BUY_LONG_TERM`
- `lt >= 60 && lt > st` → `BUY_LONG_TERM`
- `st >= 60 && st > lt` → `BUY_SHORT_TERM`
- otherwise → `HOLD`

`deriveConfidence(avgCompleteness, composite)` returns:

- `< 0.60 completeness` → `LOW`
- `>= 0.85 completeness AND (composite >= 70 OR <= 30)` → `HIGH`
- `>= 0.75 completeness` → `MEDIUM`
- otherwise → `LOW`

### 4.5 Model versioning

A constant `QSCORE_MODEL_VERSION` is exported from [`lib/scoring/model-version.ts`](../../lib/scoring/model-version.ts) so snapshots and recap analyses can identify which engine produced them. **Auditor note:** snapshot files in `data/snapshots/` should embed this version going forward if they don't already.

## 5. Storage model (Cloudflare D1)

Three migrations under [`migrations/`](../../migrations/):

### `subscribers` (0001)

```
id              INTEGER  PK AUTOINCREMENT
email           TEXT     UNIQUE NOT NULL
source          TEXT     NOT NULL DEFAULT 'waitlist'   -- waitlist | early_access | score_page | footer
ip_hash         TEXT     -- SHA-256(cf-connecting-ip), first 32 hex chars
user_agent      TEXT     -- truncated to 200 chars
country         TEXT     -- cf-ipcountry
created_at      TEXT     DEFAULT CURRENT_TIMESTAMP
```

Indexed by `created_at` and `source`. Storing `ip_hash` instead of raw IP is the privacy boundary — see audit checklist for considerations.

### `watchlist_entries` (0002)

```
id                  INTEGER  PK AUTOINCREMENT
email               TEXT     NOT NULL
ticker              TEXT     NOT NULL
last_signal         TEXT     -- snapshot of last alerted signal
last_composite      INTEGER  -- snapshot of last alerted composite
unsubscribe_token   TEXT     NOT NULL  -- 128-bit hex, per-row
added_at            TEXT     DEFAULT CURRENT_TIMESTAMP
last_notified_at    TEXT
notification_count  INTEGER  DEFAULT 0
UNIQUE(email, ticker)
```

Indexed by `email` and `ticker`. No user-account system — `email` is the identity. Unsubscribe is one-click via random per-row token (no shared secret needed; tokens are validated with a strict `[a-f0-9]{32}` regex before any DB lookup).

### `fmp_cache` (0003)

```
cache_key   TEXT  PRIMARY KEY   -- endpoint-scoped, e.g. "quote:AAPL"
payload     TEXT  NOT NULL      -- JSON string
fetched_at  TEXT  DEFAULT CURRENT_TIMESTAMP
```

Indexed by `fetched_at`. **Auditor note:** there is no eviction policy. The table will grow with universe expansion; size today is small but worth a TTL sweep eventually.

## 6. Email pipeline

All transactional email goes through [`lib/email/send.ts`](../../lib/email/send.ts), a hand-rolled HTTP client for Resend (chosen over the SDK to keep the Worker bundle small).

Four template modules:

- `welcome.ts` — waitlist confirmation
- `admin-notify.ts` — operator notification on new signup or watch
- `watchlist-confirm.ts` — per-ticker confirmation with unsubscribe URL
- `watchlist-alert.ts` — daily digest of signal changes, one email per recipient grouping all their flips

**Reliability pattern:** every send is wrapped in `ctx.waitUntil(...)` after the response returns, so the user-visible flow never blocks on Resend latency. Failures are logged but never thrown — email is best-effort.

**Configuration:** `RESEND_API_KEY` and `ADMIN_EMAIL` are managed as Wrangler **secrets** (not `vars`) — see comment in `wrangler.jsonc` explaining that dashboard-added vars get wiped on every Workers Builds redeploy and that `ADMIN_EMAIL` previously silently no-op'd because of this.

## 7. Watchlist alert loop

End-to-end flow:

1. User adds ticker via `POST /api/watch` — row inserted with a fresh 128-bit `unsubscribe_token`. Confirmation email goes out via `waitUntil`. Re-watches return `ok: true` silently and reuse the existing token (avoids leaking which tickers an address watches).
2. Daily GitHub Action (`refresh-strong-picks.yml`, 09:30 UTC) rebuilds `data/scoreboard.json` and pushes.
3. Workflow sleeps 240 s to allow Cloudflare Workers Builds to deploy.
4. Workflow `curl`s `POST /api/cron/watchlist-alerts` with `Authorization: Bearer ${WATCHLIST_CRON_TOKEN}`.
5. Cron handler loads the entire `watchlist_entries` table, joins each row against the in-bundle `scoreboard.json`, and:
   - First sighting → set baseline silently.
   - Signal flipped → enqueue a `SignalChange` for the recipient.
   - Composite-only change → refresh stored composite, no email.
   - Ticker outside universe → skip (long-tail watches currently silently no-op).
6. One digest email per recipient (all their flips bundled) sent via `waitUntil`.
7. D1 updated: baseline / flipped / composite-only branches handled separately because D1 has no clean multi-row UPDATE batching.

Auth: `WATCHLIST_CRON_TOKEN` is stored in **both** Cloudflare secrets (so the worker can verify) and the GitHub repo's Actions secrets (so the workflow can present it).

## 8. Public accountability — weekly recaps

[`lib/recaps.ts`](../../lib/recaps.ts) pairs two snapshot files in `data/snapshots/YYYY-MM-DD.json` (start ~7 trading days before end), then computes per-ticker forward returns, signal-correctness, and flip counts. Output is written to `data/recaps/{date}.json` by `weekly-recap.yml` (Mondays 14:00 UTC) and rendered by `/blog/recaps/[week]`.

**Why this matters for audit:** snapshots are append-only files in public source control, which means the start snapshot can't be retroactively edited to make a forecast look better. Forward-track performance numbers shown on `/performance` are reconstructable from git history alone.

## 9. Scheduled jobs (GitHub Actions)

| Workflow                       | Schedule (UTC) | What it does                                                                                              |
| ------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------- |
| `refresh-universe-stats.yml`   | `0 2 * * *`    | Rebuilds `data/universe-stats.json` from FMP for ~800 tickers (~35 min run, paced ~24 req/min).           |
| `refresh-strong-picks.yml`     | `30 9 * * *`   | Rebuilds `strong-picks.json` + `scoreboard.json` + daily snapshot, then triggers watchlist-alerts cron.   |
| `weekly-recap.yml`             | `0 14 * * 1`   | Builds the weekly forward-track recap from the past 7 days of snapshots.                                  |

All three commit-if-changed and push back to `master`. Cloudflare Workers Builds picks up the push and redeploys.

## 10. Feature flags

[`lib/feature-flags.ts`](../../lib/feature-flags.ts) holds binary toggles only. Today there is exactly one: `MARKET_STRIP_ENABLED`. The convention is: flip the boolean, commit, Cloudflare redeploys, feature toggles. The file explicitly notes that anything richer (multivariate, %-rollout, cohort) needs a real flag service.

## 11. Frontend surface

App Router pages of note:

| Route                                | Purpose                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `/`                                  | Marketing landing — hero, live NVDA demo (`revalidate = 3600`), top movers, waitlist form.                 |
| `/score`, `/score/[ticker]`          | Per-ticker score page; `opengraph-image.tsx` renders a dynamic OG card via `@vercel/og`.                   |
| `/scores`, `/scores/[category]`      | Universe leaderboard + per-category boards.                                                                |
| `/compare`, `/compare/[pair]`        | Pairwise comparison.                                                                                       |
| `/portfolio`                         | Client-side analyzer (`PortfolioAnalyzer.tsx`) → POSTs to `/api/portfolio/analyze`.                        |
| `/blog/*`                            | Editorial — methodology, factor investing, stock metrics, stock comparisons, recaps index.                 |
| `/glossary`, `/glossary/[slug]`      | Glossary cluster.                                                                                          |
| `/performance`                       | Public forward-track performance derived from `data/recaps/`.                                              |
| `/methodology`                       | Methodology long-read.                                                                                     |
| `/robots.ts`, `/sitemap*.xml/`       | Six sitemap surfaces split by content type.                                                                |

The full SEO surface (sitemaps, glossary, blog clusters, comparisons) is built for crawler coverage of long-tail "X stock score" queries — note this when evaluating whether an SEO surface is part of the auditable footprint.

## 12. Notable trade-offs and design decisions

- **No user accounts.** Email is identity everywhere. Subscribe and watch endpoints accept anonymous POSTs validated only by email regex + ticker regex. The argument is shipping speed; the cost is no per-user rate limit, no portfolio persistence, no auth-gated features (deferred to v1.5).
- **Stateless portfolio analyzer.** `lib/portfolio.ts` is pure functions, no D1 writes. Users paste rows of holdings into the page and get an analysis back synchronously.
- **In-bundle scoreboard.** `data/scoreboard.json` is imported as a static JSON module so the cron handler reads it without an FMP call. Cost: cron only checks watches inside the universe; long-tail watches silently skip. Documented as a future expansion.
- **GitHub Actions = production cron.** Cloudflare Workers cron triggers are not used; instead an external GitHub Action `curl`s an authenticated worker endpoint. This puts the schedule under source control and lets `gh` re-run a missed cron manually.
- **Static data, not on-the-fly compute.** Universe stats, strong picks, snapshots, scoreboard — all committed to the repo. Reproducibility is high; the trade-off is that signal accuracy lags real-time intraday moves by up to a day.
- **Append-only snapshots.** Forward-track integrity rests on the fact that start snapshots are git-tracked plain files.

## 13. Known/explicit gaps recorded in code

- `fmp_cache` has no eviction policy (size growth is bounded today but will need a sweep at scale).
- Long-tail watches (tickers outside the universe) silently skip the daily alert cron.
- `lib/feature-flags.ts` explicitly notes it can't handle anything beyond binary toggles.
- Portfolio persistence and weekly digest are deferred to v1.5 per [`lib/portfolio.ts`](../../lib/portfolio.ts).
- The Cloudflare `AI` binding is declared in `wrangler.jsonc` but not wired into any handler yet — reserved for future AI commentary.

## 14. Related documents in this audit pack

- [`02-api-reference.md`](02-api-reference.md) — endpoint-by-endpoint contracts, auth, status codes, side effects.
- [`03-audit-checklist.md`](03-audit-checklist.md) — security/operations review against project + global review rules.
