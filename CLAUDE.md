# CLAUDE.md

## Project

QScoring is a Next.js 16 marketing + waitlist site that exposes a 0–100 Quant Score and buy/hold/short signal for any US-listed equity. Deployed as a single Cloudflare Worker via OpenNext. The site is currently waitlist-stage ("Launching Summer 2026"); email is the only user identity (no accounts, no sessions).

**This repo is PUBLIC.** Never commit secrets, business plans, or proprietary docs.

## Canonical documentation

When working on architecture, APIs, or scoring logic, **read these first**:

- `docs/audit/01-architecture.md` — full runtime topology, scoring pipeline, storage model, cron loop, trade-offs
- `docs/audit/02-api-reference.md` — endpoint contracts, validation, status codes, side effects
- `docs/audit/03-audit-checklist.md` — known gaps and security review items
- `design-system/MASTER.md` — locked design tokens (palette, typography, motion). Page-specific overrides live in `design-system/pages/[page].md`.

The audit pack is the source of truth for "how does this work" questions — treat it as load-bearing documentation, not historical record.

## Commands

```bash
npm run dev               # Next.js dev server
npm run build             # next build (does NOT produce a deployable artifact)
npm run preview           # opennextjs-cloudflare build + local Worker preview
npm run deploy            # opennextjs-cloudflare build + deploy to Cloudflare
npm run cf-typegen        # regenerate cloudflare-env.d.ts from wrangler.jsonc bindings
```

Batch jobs (tsx scripts, normally run from GitHub Actions, occasionally run locally for backfills):

```bash
npm run universe-stats    # rebuild data/universe-stats.json (~35 min, paced)
npm run strong-picks      # rebuild strong-picks + scoreboard + today's snapshot
npm run weekly-recap      # rebuild this week's forward-track recap
npm run sitemap-tickers   # rebuild data/sitemap-tickers.json
npm run backfill-snapshots
```

There is no test runner configured. There is no linter beyond `tsc --noEmit` (run via `next build`).

## Deploy environment — IMPORTANT

**Production deploys must run from WSL Ubuntu (Node 22).** Windows OpenNext + `@vercel/og` has a wasm bug that breaks dynamic OG card generation. `npm run deploy` from Windows will appear to succeed but produce a broken worker. Use the GitHub Actions `deploy.yml` workflow (Ubuntu runner) for production, or run from WSL locally.

Deploy verification: Workers Builds reports as GitHub **check runs**, not commit statuses — poll `commits/{sha}/check-runs` (`commits/{sha}/status` stays "pending" forever). A live browser check is authoritative.

## Architecture cheat sheet

- **Worker bindings** (declared in `wrangler.jsonc`): `DB` (D1), `ASSETS` (static), `AI` (reserved, not wired). Access via `getCloudflareContext().env.DB` in route handlers.
- **Secrets vs vars:** Plaintext config goes in `wrangler.jsonc` `vars`. Anything sensitive (`RESEND_API_KEY`, `FMP_API_KEY`, `ADMIN_EMAIL`, `WATCHLIST_CRON_TOKEN`, `SNAPSHOT_CRON_TOKEN`) is a `wrangler secret`. **Do not move secrets to dashboard-added vars** — Workers Builds wipes those on every redeploy. The `ADMIN_EMAIL` comment in `wrangler.jsonc` documents the prior outage.
- **D1 schema:** four migrations under `migrations/` — `subscribers`, `watchlist_entries`, `fmp_cache`, `score_snapshots`. `email` is the identity column everywhere; there is no users table.
- **Scoring engine** lives entirely in `lib/scoring/`. Pipeline: FMP fetch (6 parallel `/stable/*` calls, per-endpoint TTLs) → stale-while-error D1 cache (`fmp-cache.ts`) → z-score normalization against `data/universe-stats.json` (sector if ≥15 peers else universe) → weighted composite (long + short horizon) → `deriveSignal()` / `deriveConfidence()`. Round before comparing in signal thresholds so UI integers match logic.
- **Static data committed to repo:** `data/universe-stats.json` (nightly), `data/strong-picks.json` + `data/scoreboard.json` (daily), `data/snapshots/YYYY-MM-DD.json` (append-only, daily), `data/popular-tickers.json`, `data/sitemap-tickers.json`. Snapshots are **append-only by policy** — forward-track integrity on `/performance` depends on never editing historical snapshot files.
- **Cron = GitHub Actions, not Workers cron.** Three scheduled workflows in `.github/workflows/`:
  - `refresh-universe-stats.yml` (02:00 UTC daily) — universe stats rebuild
  - `refresh-strong-picks.yml` (09:30 UTC daily) — strong picks + scoreboard + snapshot, then `curl`s `/api/cron/watchlist-alerts` with bearer token after 240s deploy wait
  - `weekly-recap.yml` (Mon 14:00 UTC) — forward-track recap
  Workflows commit-if-changed and push; Cloudflare Workers Builds redeploys on push.
- **Email:** Hand-rolled HTTP client in `lib/email/send.ts` (Resend SDK would bloat the Worker bundle). All sends go through `ctx.waitUntil(...)` — best-effort, never blocks the user response, failures logged not thrown.
- **Path alias:** `@/*` resolves to repo root (see `tsconfig.json`).

## Hard platform constraints

- Never `export const runtime = "edge"` — on OpenNext/Workers it 500s at the platform layer before the handler runs (plaintext "Internal Server Error" = workerd-layer fail). The default runtime already has `fetch` + `crypto.subtle`.
- Pages that read `data/*.json` via `fs` (`/performance`, `/movers`) MUST stay static — no `searchParams` — or prod hits the empty-state fallback on Workers. Use static `/[date]` routes, not query params.
- Cloudflare's ~400ms startup CPU limit: blog posts over ~250 lines of JSX must register via `next/dynamic` from `app/blog/bodies/`.
- Clerk on Workers: use `middleware.ts`, NOT `proxy.ts` (proxy.ts is Node-only).

## API conventions

- Tickers validated against `/^[A-Z][A-Z0-9.-]{0,9}$/` before any external call.
- Emails lowercased, trimmed, capped at 254 chars, regex-validated.
- `INSERT OR IGNORE` + return `ok: true` on duplicates is intentional (prevents existence leak for emails and watched tickers).
- Missing `DB` binding returns 503 consistently.
- Cron endpoints require `Authorization: Bearer ${TOKEN}` where the token is stored in **both** Cloudflare secrets (worker verifies) and GitHub Actions secrets (workflow presents).

## Design system

Direction is locked: **Precision Terminal** (dark navy `#0A0F1C` + gold `#F59E0B`, Inter + JetBrains Mono only). Signal palette is domain-locked semantics — green=buy, amber=hold, red=short. Hard NOs documented in `design-system/MASTER.md`: no emoji icons (use Lucide SVG), no purple/violet, no pink/rainbow gradients, no gamification, no stock photography. When building a page, check `design-system/pages/[page-name].md` first; it overrides the master.
