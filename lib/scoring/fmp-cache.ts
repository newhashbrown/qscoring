import { AsyncLocalStorage } from "node:async_hooks";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Stale-while-error cache for FMP. The happy path keeps the worker fast by
// writing through ctx.waitUntil so the response returns before D1 commits.
// On a transient FMP failure (429-exhausted, 5xx, network), callers read the
// last-known-good payload instead of surfacing the error.
//
// Outside of a Worker (next dev, the universe-stats build script running in
// Node) getCloudflareContext throws and every helper here cleanly no-ops.

type CacheRow = { payload: string; fetched_at: string };
type CfCtx = { waitUntil?: (p: Promise<unknown>) => void };

function safeCfContext(): { env: CloudflareEnv; ctx: CfCtx } | null {
  try {
    return getCloudflareContext() as { env: CloudflareEnv; ctx: CfCtx };
  } catch {
    return null;
  }
}

function getDb(): D1Database | null {
  return safeCfContext()?.env?.DB ?? null;
}

export async function readCache<T>(
  key: string
): Promise<{ data: T; fetchedAt: string } | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT payload, fetched_at FROM fmp_cache WHERE cache_key = ?")
      .bind(key)
      .first<CacheRow>();
    if (!row) return null;
    return { data: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at };
  } catch (err) {
    console.error(`fmp_cache read failed (${key}):`, err);
    return null;
  }
}

export function writeCacheAsync(key: string, value: unknown): void {
  const cf = safeCfContext();
  const db = cf?.env?.DB;
  if (!db) return;

  const work = (async () => {
    try {
      await db
        .prepare(
          "INSERT INTO fmp_cache (cache_key, payload) VALUES (?, ?) " +
            "ON CONFLICT(cache_key) DO UPDATE SET " +
            "payload = excluded.payload, fetched_at = CURRENT_TIMESTAMP"
        )
        .bind(key, JSON.stringify(value))
        .run();
    } catch (err) {
      console.error(`fmp_cache write failed (${key}):`, err);
    }
  })();

  if (cf?.ctx?.waitUntil) {
    cf.ctx.waitUntil(work);
  } else {
    console.warn(`fmp_cache: ctx.waitUntil unavailable — write for "${key}" will not be awaited by the runtime`);
  }
}

// Per-request staleness collector. fmpGet calls recordStale when serving
// a cached payload because the live fetch failed. Callers that care about
// surfacing "data as of X" to the user wrap their fetches in
// withStalenessTracking and read the oldest fetched_at timestamp back out.
// Outside a tracked scope, recordStale silently no-ops.

type StaleEntry = { key: string; fetchedAt: string };

const stalenessStorage = new AsyncLocalStorage<StaleEntry[]>();

export function recordStale(key: string, fetchedAt: string): void {
  stalenessStorage.getStore()?.push({ key, fetchedAt });
}

export async function withStalenessTracking<T>(
  fn: () => Promise<T>
): Promise<{ result: T; oldestStaleAt: string | null }> {
  const store: StaleEntry[] = [];
  const result = await stalenessStorage.run(store, fn);
  if (store.length === 0) return { result, oldestStaleAt: null };
  const oldest = store.reduce((a, b) => (a.fetchedAt < b.fetchedAt ? a : b));
  return { result, oldestStaleAt: oldest.fetchedAt };
}
