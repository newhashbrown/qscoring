---
name: deploy-verify
description: Verify the latest push actually deployed to qscoring.com — poll GitHub check runs (NOT commit statuses) and confirm the live site renders.
disable-model-invocation: true
---

# Deploy verification (qscoring)

Workers Builds reports deploy status as GitHub **check runs**. The commit-status API (`commits/{sha}/status`) stays "pending" forever — polling it is a false signal. Never conclude "deployed" from a push alone.

## Steps

1. **Get the SHA under verification:**
   ```bash
   git rev-parse HEAD          # or: gh api repos/newhashbrown/qscoring/commits/main --jq .sha
   ```

2. **Poll check runs until completed** (~30s intervals; Workers Builds typically finishes in 2–5 min):
   ```bash
   gh api repos/newhashbrown/qscoring/commits/$SHA/check-runs \
     --jq '.check_runs[] | [.name,.status,.conclusion] | @tsv'
   ```
   - `status=completed, conclusion=success` → proceed to step 3.
   - `conclusion=failure` → open `details_url` from the check run and diagnose the build log.
   - No check runs at all after ~2 min → confirm the push actually reached `main`.

3. **Live check (authoritative):** fetch `https://qscoring.com` (and the specific page if the change was page-scoped). Confirm HTTP 200 and a marker unique to the change. A green check run without a live render is NOT a verified deploy — a plaintext "Internal Server Error" body means a workerd-layer failure (e.g. edge runtime export).
