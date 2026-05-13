# QScoring — API Reference (Audit Edition)

All routes are Next.js App Router handlers under [`app/api/`](../../app/api/), deployed inside a single Cloudflare Worker via OpenNext. There is no separate API gateway; the Worker itself is the trust boundary.

Conventions:
- All handlers read JSON when POST.
- Email is the user identity. No JWTs, no sessions, no cookies for auth.
- Tickers are validated against `/^[A-Z][A-Z0-9.-]{0,9}$/` before any external call.
- Emails are lowercased, trimmed, length-capped at 254, validated against a minimal RFC-ish regex.
- D1 access is via `getCloudflareContext().env.DB`; a missing binding returns `503` consistently.
- Resend sends are fire-and-forget through `ctx.waitUntil(...)` so user-visible latency is bounded by D1 + validation.

---

## `POST /api/subscribe`

Public waitlist endpoint. Inserts into `subscribers` and triggers welcome + admin emails.

**Request body:**

```json
{ "email": "user@example.com", "source": "waitlist" }
```

`source` must be one of `waitlist | early_access | score_page | footer` (defaults to `waitlist` on miss).

**Side effects:**

1. SHA-256-hash `cf-connecting-ip` (first 32 hex chars) → `ip_hash`.
2. Capture `cf-ipcountry` and `user-agent` (truncated to 200 chars).
3. `INSERT OR IGNORE` row (silent no-op on duplicate email so existence isn't leaked).
4. If `meta.changes > 0` (new row):
   - `SELECT COUNT(*) FROM subscribers` (best-effort, never blocks).
   - Send welcome email to subscriber.
   - If `ADMIN_EMAIL` secret set, send admin notification.

**Responses:**

| Status | Body                                             | Cause                              |
| ------ | ------------------------------------------------ | ---------------------------------- |
| 200    | `{ "ok": true }`                                 | Insert succeeded OR was a duplicate |
| 400    | `{ "ok": false, "error": "Invalid JSON" }`       | Body not valid JSON                |
| 400    | `{ "ok": false, "error": "Invalid email" }`      | Regex/length validation failed     |
| 500    | `{ "ok": false, "error": "Could not save email" }` | D1 insert raised                  |
| 503    | `{ "ok": false, "error": "Cloudflare context not available" }` | Outside Worker context |
| 503    | `{ "ok": false, "error": "Database binding missing" }`        | DB binding absent       |

**Auditor notes:**

- Duplicate-email check returns `ok: true` to avoid leaking existence. This is intentional and aligned with privacy best practices.
- No rate limiting at the application layer. Cloudflare's edge rate-limiting (if configured at the dashboard level) is the only defense against email-stuffing.
- `ip_hash` is unsalted SHA-256 truncated to 128 bits. A motivated attacker with an IP list could brute-force matches against this column. See [`03-audit-checklist.md`](03-audit-checklist.md).

---

## `POST /api/watch`

Public watchlist enrollment. Inserts into `watchlist_entries` and triggers a confirmation email containing the one-click unsubscribe URL.

**Request body:**

```json
{ "email": "user@example.com", "ticker": "NVDA" }
```

**Side effects:**

1. Generate 128-bit random `unsubscribe_token` (`crypto.getRandomValues`).
2. `INSERT OR IGNORE` row keyed by `UNIQUE(email, ticker)`.
3. On re-watch, read back the existing token so the reused link still works.
4. On new insert, fire confirmation email (with `https://qscoring.com/api/watch/unsubscribe?id={id}&token={token}`) and optional admin notify, both via `waitUntil`.

**Responses:**

| Status | Body                                             | Cause                              |
| ------ | ------------------------------------------------ | ---------------------------------- |
| 200    | `{ "ok": true }`                                 | New or duplicate, indistinguishable |
| 400    | `{ "ok": false, "error": "Invalid email" }`      | Email regex/length failed          |
| 400    | `{ "ok": false, "error": "Invalid ticker" }`     | Ticker regex failed                |
| 500    | `{ "ok": false, "error": "Could not save watch entry" }` | D1 raised                  |
| 503    | Same 503s as `/api/subscribe`                    | Worker context / DB missing        |

**Auditor notes:**

- `INSERT OR IGNORE` returning `ok: true` on re-watch is intentional: prevents leaking which tickers an email already follows.
- No rate limit. Spamming this endpoint creates rows in D1 but each `(email, ticker)` pair caps to one row by the unique constraint.

---

## `GET /api/watch/unsubscribe?id={id}&token={token}`

One-click unsubscribe via HTML response (so plain mail clients can follow the link). The handler returns dark-themed HTML pages directly, all with `<meta name="robots" content="noindex,nofollow">`.

**Validation:**

- `id` must match `/^\d+$/`.
- `token` must match `/^[a-f0-9]{32}$/`.

**Side effects:**

- `DELETE FROM watchlist_entries WHERE id = ? AND unsubscribe_token = ?` — both conditions required, so a guessed ID alone cannot unsubscribe another row.
- Idempotent: clicking twice returns the "already unsubscribed" page silently.

**Outcomes:**

| Scenario                                  | Page title                          |
| ----------------------------------------- | ----------------------------------- |
| Invalid/missing params                    | "Invalid unsubscribe link"          |
| Row missing or token wrong                | "Already unsubscribed" (silent succ)|
| Worker context unavailable                | "Unsubscribe temporarily unavailable" |
| D1 raises                                 | "Unsubscribe failed"                |
| Success                                   | "Unsubscribed from {TICKER}"        |

**Auditor notes:**

- The token is the only authenticator. With 128 bits of randomness, online guessing is infeasible. Token is single-use only in the sense that the row it points to is destroyed.
- Page templates inline-interpolate `${ticker}` into HTML. `ticker` is read from D1 (it was validated against the strict regex on insert), so the only XSS surface is the inserted ticker string. **Auditor todo:** confirm the regex is enforced on every insert path that writes to this column.

---

## `GET /api/score/[ticker]`

Returns the full `ScoreResult` JSON. `revalidate = 900` plus an explicit `cache-control: public, s-maxage=900, stale-while-revalidate=1800` header.

**Validation:** ticker passes through `validateTicker()` in `lib/scoring/score.ts`. Invalid → 400. The handler classifies errors:

| Status | Triggered by                            |
| ------ | --------------------------------------- |
| 200    | Full `ScoreResult` body                 |
| 400    | Error message matches `/invalid ticker/i` |
| 402    | Error message matches `/data plan/i` (FMP not-in-plan) |
| 404    | Error message matches `/not found\|no profile/i` |
| 500    | Anything else                           |

`ScoreResult` shape: see [`lib/scoring/types.ts`](../../lib/scoring/types.ts). The `staleSince` field is set when stale-while-error cache served any payload.

**Auditor notes:**

- The handler classifies errors by regex over the message string. If a future error message accidentally matches one of these patterns, the status would be wrong. Low-risk but flagged in the checklist.
- FMP responses can include 5-year history (~1300 trading days × full record). Per-request payload size is bounded by FMP, not by us.

---

## `GET /api/history/[ticker]`

Lighter sibling of `/api/score`. Returns up to 5 years of `{date, price}` pairs trimmed from the FMP historical-price feed for charting.

| Status | Body                                |
| ------ | ----------------------------------- |
| 200    | `{ ticker, history: [{date, price}] }` |
| 400    | `{ "error": "Invalid ticker" }`     |
| 500    | `{ error, history: [] }`            |

Cached identically to `/api/score`.

---

## `GET /api/search?q={query}`

Symbol search via `searchSymbols(query, 8)` in `lib/scoring/search.ts`. Cached for 1 hour (`s-maxage=3600`, `stale-while-revalidate=86400`).

| Status | Body                                                  |
| ------ | ----------------------------------------------------- |
| 200    | `{ matches: SearchHit[] }` (empty array on empty query) |
| 500    | `{ matches: [], error }` (search threw)               |

---

## `POST /api/portfolio/analyze`

Stateless portfolio analyzer. Accepts up to 30 entries, scores each (scoreboard hit fast-path, else live `scoreTicker()` with concurrency cap of 4), and returns the aggregated analysis.

**Request body:**

```json
{
  "mode": "equal | weights | shares | values",
  "entries": [{ "ticker": "AAPL", "rawNumber": 100 }, ...]
}
```

**Notable internals:**

- `lib/portfolio.ts` includes a `NOT_A_TICKER` denylist of brokerage UI vocabulary ("TOTAL", "CASH", "BUY", etc.) so pasted account tables don't yield bogus tickers.
- No D1 write — fully stateless.

---

## `POST /api/cron/watchlist-alerts`

Internal cron endpoint. Detects signal changes by joining `watchlist_entries` against the in-bundle `data/scoreboard.json`, sends one digest per recipient, updates bookkeeping.

**Auth:** `Authorization: Bearer ${WATCHLIST_CRON_TOKEN}`. Constant-time comparison is **not** used (plain `===`); the token is sufficiently long and high-entropy that timing-channel exposure is negligible, but it's worth flagging.

**Responses:**

| Status | Body                                              |
| ------ | ------------------------------------------------- |
| 200    | `{ ok: true, summary: { totalRows, baselined, flipped, compositeOnlyUpdated, skippedNoScoreboardEntry, digestsSent, totalSignalChangesAlerted } }` |
| 401    | `{ ok: false, error: "Unauthorized" }`            |
| 500    | `{ ok: false, error: "Watchlist query failed" }`  |
| 503    | Worker context / DB binding 503s                  |

**Update semantics (each row falls into exactly one bucket):**

| State                                    | Action                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Ticker absent from scoreboard            | Skip; `skippedNoScoreboardEntry++`.                                     |
| `last_signal IS NULL` (first sight)      | Set `last_signal` + `last_composite`; no email; `baselined++`.          |
| `last_signal !== currentSignal`          | Enqueue digest entry; update both fields + `last_notified_at`; bump `notification_count`. |
| Composite differs only                   | Update `last_composite`; no email.                                      |

**Auditor notes:**

- All D1 updates run inside one async function inside `waitUntil`. If the worker is killed before any update completes, baseline / flipped / composite buckets could partially apply — but rows remain valid (the next run reconciles).
- No multi-row D1 batching is available; updates are individual prepared statements. At scale, watch for D1 write rate caps.

---

## Trust boundary summary

| Surface                               | Trust            | Auth                  |
| ------------------------------------- | ---------------- | --------------------- |
| `POST /api/subscribe`                 | Public           | None                  |
| `POST /api/watch`                     | Public           | None                  |
| `GET /api/watch/unsubscribe`          | Public           | Per-row 128-bit token |
| `GET /api/score/[ticker]`             | Public           | None                  |
| `GET /api/history/[ticker]`           | Public           | None                  |
| `GET /api/search`                     | Public           | None                  |
| `POST /api/portfolio/analyze`         | Public           | None                  |
| `POST /api/cron/watchlist-alerts`     | Internal (GHA)   | Bearer token          |

Outbound integrations:

| Integration       | Where called                       | Secret                       |
| ----------------- | ---------------------------------- | ---------------------------- |
| FMP               | `lib/scoring/fmp.ts`               | `FMP_API_KEY` (process.env)  |
| Resend            | `lib/email/send.ts`                | `RESEND_API_KEY` (cf.env)    |
| Cloudflare D1     | All handlers via `getCloudflareContext().env.DB` | binding `DB`     |
| Cloudflare AI     | _Not yet wired_                    | binding `AI` (reserved)      |
