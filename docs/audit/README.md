# QScoring — Audit Pack

Read-only documentation export of the QScoring codebase, generated 2026-05-13 for architecture and security auditing.

| # | Document                                  | Audience                                  |
| - | ----------------------------------------- | ----------------------------------------- |
| 1 | [Architecture](01-architecture.md)        | Engineers, ops, technical reviewers       |
| 2 | [API Reference](02-api-reference.md)      | Backend reviewers, integrators            |
| 3 | [Audit Checklist](03-audit-checklist.md)  | Security review, pre-launch sign-off      |

## How to use this pack

- Start with **01-architecture.md** for the system tour: runtime topology, scoring engine, storage, scheduled jobs.
- Move to **02-api-reference.md** for endpoint-by-endpoint contracts, validation, and trust boundaries.
- Finish with **03-audit-checklist.md** for the prioritized findings list and pre-launch blocking checklist.

## Scope

All findings reflect the state of `~/qscoring` at the time of generation. The audit covers:

- App Router routes under [`app/`](../../app/)
- Server libraries under [`lib/`](../../lib/)
- D1 migrations under [`migrations/`](../../migrations/)
- Cloudflare Worker config: [`wrangler.jsonc`](../../wrangler.jsonc), [`open-next.config.ts`](../../open-next.config.ts)
- GitHub Actions under [`.github/workflows/`](../../.github/workflows/)

It does **not** cover: marketing copy quality, financial-accuracy claims, performance benchmarks, or build-platform compatibility issues (the WSL-only deployment requirement is a separate operational note).

## Regenerating this pack

The pack is a snapshot — when the repo changes, re-run the audit walk and refresh the three files. There is no automation tied to it.
