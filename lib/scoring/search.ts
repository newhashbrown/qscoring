/**
 * Symbol/name search via FMP. Used when a user types a company name like
 * "Apple" or "Microsoft" instead of a ticker.
 */

const BASE = "https://financialmodelingprep.com/stable";

export type SearchMatch = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
};

type FmpSearchResp = Array<{
  symbol: string;
  name: string;
  exchange?: string;
  exchangeFullName?: string;
  currency?: string;
}>;

const PREFERRED_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX", "BATS", "ARCA", "CBOE"]);

async function fmpSearch(endpoint: "search-symbol" | "search-name", query: string, limit: number): Promise<FmpSearchResp> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY not set");
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apikey", apiKey);
  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`FMP ${endpoint} → ${res.status}`);
  }
  return (await res.json()) as FmpSearchResp;
}

/**
 * Search by either ticker prefix or company name. FMP exposes these as two
 * separate endpoints (/search-symbol and /search-name), so we query both in
 * parallel, merge, and dedupe by symbol so a user can type "AAPL" or "Apple"
 * and get the same result.
 */
export async function searchSymbols(query: string, limit = 8): Promise<SearchMatch[]> {
  const q = query.trim();
  if (!q) return [];

  const [symbolHits, nameHits] = await Promise.all([
    fmpSearch("search-symbol", q, limit).catch(() => [] as FmpSearchResp),
    fmpSearch("search-name", q, limit).catch(() => [] as FmpSearchResp),
  ]);

  const seen = new Set<string>();
  const merged: SearchMatch[] = [];
  // Symbol hits first — if the user typed a literal ticker prefix, that's the strongest signal.
  for (const d of [...symbolHits, ...nameHits]) {
    if (!d.symbol || seen.has(d.symbol)) continue;
    seen.add(d.symbol);
    merged.push({
      symbol: d.symbol,
      name: d.name,
      exchange: d.exchange ?? d.exchangeFullName ?? "",
      currency: d.currency ?? "USD",
    });
  }

  // Prefer US exchanges first, then USD-denominated, then everything else.
  merged.sort((a, b) => {
    const aPref = PREFERRED_EXCHANGES.has(a.exchange) ? 0 : 1;
    const bPref = PREFERRED_EXCHANGES.has(b.exchange) ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    if (a.currency === "USD" && b.currency !== "USD") return -1;
    if (b.currency === "USD" && a.currency !== "USD") return 1;
    return 0;
  });

  return merged.slice(0, limit);
}

export async function findBestMatch(query: string): Promise<SearchMatch | null> {
  const matches = await searchSymbols(query, 5);
  return matches[0] ?? null;
}
