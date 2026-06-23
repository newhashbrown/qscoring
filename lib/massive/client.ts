/**
 * Massive market data API client (https://massive.com).
 *
 * Polygon-style REST. Auth: Bearer token. Works in both Node and Cloudflare
 * Workers — plain fetch, no proxy or special dispatchers.
 *
 * Today this only exposes prev-close / daily aggregates because the only
 * caller is the FMP cross-check script. Grow the surface area when there's
 * a real second use case.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

const BASE = "https://api.massive.com";

// Cloudflare-set secrets reach us via the Worker env binding, not always via
// process.env. Prefer the env binding when available, fall back to process.env
// for Node-side scripts (scripts/cross-check-massive.ts) and local dev.
function getApiKey(): string {
  try {
    const ctx = getCloudflareContext();
    const key = (ctx?.env as { MASSIVE_API_KEY?: string } | undefined)?.MASSIVE_API_KEY;
    if (key) return key;
  } catch {
    // not running inside a Worker — fall through to process.env
  }
  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new Error("MASSIVE_API_KEY environment variable is not set");
  return key;
}

// Massive (like Polygon) keys class shares with a dot: BRK.B, BF.B.
// FMP uses hyphens. Caller passes whatever; we normalize.
function massiveSymbol(symbol: string): string {
  return symbol.replace(/-/g, ".");
}

export type MassiveBar = {
  T?: string;       // ticker (present on /prev, absent on /range)
  c: number;        // close
  o: number;        // open
  h: number;        // high
  l: number;        // low
  v: number;        // volume
  vw?: number;      // volume-weighted avg price
  t: number;        // unix ms of bar start
  n?: number;       // num transactions
};

type AggsResponse = {
  status: string;
  ticker?: string;
  resultsCount: number;
  results?: MassiveBar[];
  request_id: string;
};

// Bound a single Massive call so a stalled upstream can't hold a Worker
// request open indefinitely (security audit H2). Massive is only hit as the
// FMP fallback, so a timeout simply surfaces the upstream error to the caller.
const MASSIVE_TIMEOUT_MS = 8_000;

async function massiveGet<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
    signal: AbortSignal.timeout(MASSIVE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Massive ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const massive = {
  prevClose: async (symbol: string): Promise<MassiveBar | null> => {
    const s = massiveSymbol(symbol);
    const data = await massiveGet<AggsResponse>(
      `/v2/aggs/ticker/${encodeURIComponent(s)}/prev?adjusted=true`
    );
    return data.results?.[0] ?? null;
  },

  /**
   * Daily bars between two ISO dates (YYYY-MM-DD), newest-first. Adjusted
   * for splits/dividends.
   */
  historical: async (symbol: string, fromIso: string, toIso: string): Promise<MassiveBar[]> => {
    const s = massiveSymbol(symbol);
    const data = await massiveGet<AggsResponse>(
      `/v2/aggs/ticker/${encodeURIComponent(s)}/range/1/day/${fromIso}/${toIso}?adjusted=true&sort=desc`
    );
    return data.results ?? [];
  },
};
