# QScoring — Security & Operations Audit Checklist

Scoped against the user's global code-review and security rules. Findings are classified `CRITICAL` (block merge / ship), `HIGH` (fix before launch), `MEDIUM` (track), `LOW` (note).

## Summary verdict

**No CRITICAL findings.** The application has a small, well-scoped attack surface, no user accounts, and consistent input validation at every entry point. The principal risks are operational (cron-token rotation, rate-limit absence at the application layer) rather than vulnerabilities.

## 1. Secret management

| Secret                  | Lives in                          | Confirmed? |
| ----------------------- | --------------------------------- | ---------- |
| `FMP_API_KEY`           | Cloudflare secret + GHA repo secret | Yes — referenced via `process.env.FMP_API_KEY` |
| `RESEND_API_KEY`        | Cloudflare secret                 | Yes — read via `cf.env` first, falls back to `process.env` |
| `ADMIN_EMAIL`           | Cloudflare secret                 | Yes — comment in `wrangler.jsonc` calls out that dashboard `vars` get wiped on redeploy |
| `WATCHLIST_CRON_TOKEN`  | Cloudflare secret + GHA repo secret | Yes — both copies must match |
| `EMAIL_FROM`            | Wrangler `vars` (plaintext OK)    | Yes |

- ✅ `.env` and `.env.example` exist; the `.env` file is git-ignored per `.gitignore`.
- ✅ No secrets are hardcoded in source. `grep`-equivalent of `FMP_API_KEY` and `RESEND_API_KEY` shows only env reads.
- ⚠️ **LOW** — `.env` is `0777` on disk per `ls -la`. Tighten permissions to `0600` on the WSL host (`chmod 600 .env`). Doesn't ship to production but reduces local-host blast radius.

## 2. Input validation

| Surface                        | Validation                                          | Verdict |
| ------------------------------ | --------------------------------------------------- | ------- |
| Email (subscribe, watch)       | `EMAIL_RE`, length ≤ 254, lowercased + trimmed      | ✅ |
| Source (subscribe)             | Allowlist `Set` of 4 strings, default `waitlist`    | ✅ |
| Ticker (watch, score, history) | `TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/`              | ✅ |
| Unsubscribe `id`               | `/^\d+$/`                                            | ✅ |
| Unsubscribe `token`            | `/^[a-f0-9]{32}$/`                                   | ✅ |
| Portfolio mode                 | Allowlist of 4 strings, max 30 entries              | ✅ |
| Portfolio ticker               | `TICKER_RE` + `NOT_A_TICKER` denylist               | ✅ |
| Search query                   | Trimmed, empty → empty matches                       | ✅ |
| FMP symbol normalization       | Hyphens for class shares (`BRK-B`, `BF-B`)          | ✅ |

✅ Every parameterized D1 query uses `.prepare(...).bind(...)`. No string concatenation into SQL anywhere in the repo.

## 3. Authentication / Authorization

- ✅ The only authenticated endpoint is `POST /api/cron/watchlist-alerts`, gated by `Authorization: Bearer ${WATCHLIST_CRON_TOKEN}`.
- ⚠️ **MEDIUM** — Token comparison uses plain `===` (`app/api/cron/watchlist-alerts/route.ts`). Switch to a constant-time compare via `crypto.subtle.timingSafeEqual`-style helper. Even though the token is high-entropy, this is a free win and aligns with the user's security rule "Authentication/authorization verified."
- ✅ No user accounts. Email is the only identifier; per-row tokens authenticate sensitive actions (unsubscribe).

## 4. XSS / output encoding

- ✅ Most user input never reaches HTML — emails and tickers are stored or echoed back as JSON.
- ⚠️ **LOW** — `app/api/watch/unsubscribe/route.ts` interpolates `ticker` directly into HTML response: `<strong>${ticker}</strong>`. Tickers are pre-validated against a strict regex, so today this is safe. Defense-in-depth recommendation: HTML-escape on output anyway. Cost is one helper call.

## 5. CSRF

- N/A for this app — there are no cookie-authenticated, state-changing endpoints. `POST /api/subscribe` and `POST /api/watch` are public and intentionally don't require a session. Anti-abuse for these belongs at the edge (Cloudflare rate-limiting) rather than CSRF tokens.

## 6. Rate limiting

- ❌ **HIGH** — None of the public endpoints rate-limit at the application layer:
  - `POST /api/subscribe` — an attacker can hammer it with synthetic emails.
  - `POST /api/watch` — same; bounded only by the `UNIQUE(email, ticker)` constraint after the fact.
  - `GET /api/score/[ticker]` and `GET /api/history/[ticker]` — every call is potentially a paid FMP request when cache misses.
  - `POST /api/portfolio/analyze` — up to 30 live `scoreTicker()` calls per request.

  **Recommendation:** enable a Cloudflare Rate Limiting rule at the dashboard (e.g., 30 POST /api/* per minute per IP) before any public launch. Document the exact rule in this file once configured.

## 7. PII handling

- ✅ Subscriber IP is hashed (SHA-256 truncated to 128 bits) before storage. The hashing happens in-handler via `crypto.subtle.digest`, never persisted raw.
- ✅ `user_agent` truncated to 200 chars to bound storage.
- ⚠️ **MEDIUM** — `ip_hash` is unsalted SHA-256. A motivated attacker who exfiltrates the table and has a list of candidate IPs can confirm membership via rainbow-style lookups. **Recommendation:** prepend a server-side salt held in a Cloudflare secret (e.g., `IP_HASH_SALT`) before digesting. One-time migration to recompute existing hashes is unnecessary if the table is small at audit time.
- ✅ Email-existence not leaked: both `/api/subscribe` and `/api/watch` return `ok: true` for duplicates.
- ✅ Unsubscribe link uses per-row 128-bit token, not email — links cannot be enumerated or rebuilt from outside.

## 8. Cookies / sessions

- ✅ The app sets no cookies. No session store, no Set-Cookie headers anywhere in `app/`.

## 9. HTTPS / headers

- ⚠️ **LOW** — There is no global header middleware in this project. Cloudflare default headers (HSTS, etc.) may or may not be enabled at the zone level. **Recommendation:** confirm zone-level HSTS preload, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy at the Cloudflare dashboard, or add a Next.js `headers()` config.

## 10. Error disclosure

- ✅ Error responses use neutral messages. The score endpoint surfaces friendlier prose for known FMP states (402 = "not in plan", 404 = "ticker not found") but never includes raw FMP response bodies.
- ✅ The score endpoint maps unhandled errors to 500 without echoing stack traces.
- ⚠️ **LOW** — The `/api/score/[ticker]` handler classifies errors by `regex` over the message string (`/invalid ticker/i`, `/data plan/i`, `/not found|no profile/i`). A future error string that accidentally matches would mis-classify. Replace with typed errors (e.g., extend the existing `FmpUnavailableError` with a discriminator field and check `err instanceof FmpUnavailableError`).

## 11. Cloudflare worker hygiene

- ✅ `nodejs_compat` and `global_fetch_strictly_public` flags both set. The second guards against private-network fetches from the Worker.
- ✅ Observability enabled.
- ✅ All async fire-and-forget work goes through `ctx.waitUntil`. There is no detached-promise pattern in the codebase that would silently kill emails or D1 writes on response.
- ✅ The `AsyncLocalStorage` staleness tracker is correctly scoped via `stalenessStorage.run(...)`. Outside the scope, `recordStale` cleanly no-ops.

## 12. Data integrity & reproducibility

- ✅ Forward-track recaps rest on append-only snapshot files in source control. Snapshots cannot be retroactively edited without a visible commit.
- ✅ Universe stats are rebuilt nightly and committed; provenance is the GitHub Action `refresh-universe-stats.yml`.
- ⚠️ **MEDIUM** — The `QSCORE_MODEL_VERSION` constant exists but I did not verify it is embedded in every snapshot file. **Auditor todo:** confirm `scripts/build-strong-picks.ts` writes the version into each `data/snapshots/YYYY-MM-DD.json` so historic recaps can be associated with the model that produced them.

## 13. Operational risks

| Risk                                            | Severity | Notes |
| ----------------------------------------------- | -------- | ----- |
| `fmp_cache` table has no eviction               | LOW      | Add a periodic `DELETE WHERE fetched_at < datetime('now','-30 days')` once the universe expands. |
| GHA → Cloudflare deploy race                    | MEDIUM   | `refresh-strong-picks.yml` sleeps 240 s before hitting the cron endpoint. If Workers Builds takes longer than 4 min, the cron reads stale scoreboard. Mitigation: poll the deploy webhook or check a deployed git SHA before issuing the curl. |
| `WATCHLIST_CRON_TOKEN` rotation                 | MEDIUM   | Two copies (Cloudflare secret + GHA secret) must rotate together. Document the rotation runbook. |
| Long-tail watches silently skip alerts          | LOW      | Documented in code. Either expand universe or add live `scoreTicker()` for off-universe rows once FMP plan allows. |
| Resend hard outage                              | LOW      | Welcome/admin emails are best-effort with `waitUntil`; failures log and drop. Acceptable for now but a Resend status check could feed a fall-back queue later. |
| Cloudflare AI binding declared but unused       | LOW      | Either wire it or remove from `wrangler.jsonc` to keep config truthful. |

## 14. Code-style review (against `~/.claude/rules/common/coding-style.md`)

| Check                                           | Result |
| ----------------------------------------------- | ------ |
| Functions <50 lines                             | ✅ Mostly. `/api/cron/watchlist-alerts` route handler is ~150 LOC of cohesive logic; consider extracting `classifyRow()` and `applyUpdates()` to keep the handler narrow. |
| Files <800 lines                                | ✅ All files inspected are well under. |
| Deep nesting <4 levels                          | ✅ Handlers favor early returns. |
| Errors handled explicitly                       | ✅ Every D1 call is `try/catch` with a fall-through status. |
| Input validation at boundaries                  | ✅ Every public handler validates first thing. |
| No hardcoded values                             | ✅ TTLs are named constants in `lib/scoring/fmp.ts`; horizon weights are named in `lib/scoring/score.ts`. |
| Immutable patterns                              | ✅ `lib/scoring/score.ts` and `lib/portfolio.ts` are pure-function style. `momentum.ts` uses `[...history].sort()` defensively rather than mutating. |
| No console.log/debug                            | ⚠️ Several intentional `console.error` and one `console.warn` for diagnostic surfacing. These are acceptable in Worker logs (observability is enabled) but inventory them once and decide whether to switch to a structured logger. |

## 15. Test coverage

- ❌ **HIGH** — There are no test files in this repo. The scoring engine, portfolio analyzer, recap analyzer, and cron handler are all critical-correctness paths and currently have zero automated coverage.

  Minimum recommended set before a public launch:

  - Unit tests for `lib/scoring/zscore.ts`, `lib/scoring/momentum.ts`, `lib/scoring/score.ts:deriveSignal`, `lib/scoring/score.ts:deriveConfidence`, `lib/portfolio.ts:analyzeBlend`.
  - Integration tests for `/api/subscribe`, `/api/watch`, `/api/watch/unsubscribe` (use Miniflare for D1).
  - A regression test that pairs a known start snapshot with a known end snapshot and asserts the recap row outputs.

## 16. Blocking checklist before public launch

- [ ] **HIGH** — Configure Cloudflare Rate Limiting on `/api/subscribe`, `/api/watch`, `/api/portfolio/analyze`, `/api/score/*`.
- [ ] **HIGH** — Add at least the minimum recommended test suite above.
- [ ] **MEDIUM** — Salt the IP hash via a Cloudflare secret.
- [ ] **MEDIUM** — Switch cron-token comparison to constant-time.
- [ ] **MEDIUM** — Confirm `QSCORE_MODEL_VERSION` is embedded in every snapshot file.
- [ ] **MEDIUM** — Document `WATCHLIST_CRON_TOKEN` rotation runbook.
- [ ] **LOW** — Confirm/configure HSTS + standard security headers at the Cloudflare zone level.
- [ ] **LOW** — HTML-escape `ticker` in the unsubscribe response page.
- [ ] **LOW** — Replace error-message regex in `/api/score/[ticker]` with typed-error discrimination.
- [ ] **LOW** — Either wire or remove the unused `AI` binding in `wrangler.jsonc`.

## 17. Out of scope for this audit

- The marketing copy on `app/page.tsx` and `app/blog/*` (editorial review, not security).
- Financial accuracy of the scoring methodology itself (that's the job of `/methodology` and the public recaps surface).
- Performance benchmarking under load (no synthetic load test was run).
