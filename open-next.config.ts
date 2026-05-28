import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

// KV-backed incremental cache for Next.js ISR + Data Cache. Without
// this override, OpenNext's default in-memory cache is empty on every
// cold start, so `export const revalidate = N` on pages and routes
// never actually saves work — each cold isolate re-renders from
// scratch. The KV binding `NEXT_INC_CACHE_KV` is declared in
// wrangler.jsonc.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
