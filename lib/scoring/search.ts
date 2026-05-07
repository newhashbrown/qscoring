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

// Brand → primary ticker. FMP's search doesn't know that "google" means
// Alphabet (since Alphabet's official name doesn't contain "Google"), so the
// most common queries return derivative ETFs instead. This map shortcuts the
// obvious cases. Lowercase keys; lookup uses normalized query.
const ALIAS_TO_TICKER: Record<string, string> = {
  google: "GOOGL",
  alphabet: "GOOGL",
  facebook: "META",
  meta: "META",
  amazon: "AMZN",
  apple: "AAPL",
  microsoft: "MSFT",
  nvidia: "NVDA",
  tesla: "TSLA",
  netflix: "NFLX",
  disney: "DIS",
  walmart: "WMT",
  costco: "COST",
  "coca cola": "KO",
  "coca-cola": "KO",
  coke: "KO",
  pepsi: "PEP",
  "pepsi co": "PEP",
  pepsico: "PEP",
  mcdonalds: "MCD",
  "mc donalds": "MCD",
  starbucks: "SBUX",
  nike: "NKE",
  visa: "V",
  mastercard: "MA",
  paypal: "PYPL",
  airbnb: "ABNB",
  uber: "UBER",
  lyft: "LYFT",
  doordash: "DASH",
  spotify: "SPOT",
  shopify: "SHOP",
  salesforce: "CRM",
  oracle: "ORCL",
  adobe: "ADBE",
  intel: "INTC",
  amd: "AMD",
  ibm: "IBM",
  cisco: "CSCO",
  qualcomm: "QCOM",
  broadcom: "AVGO",
  jpmorgan: "JPM",
  "jp morgan": "JPM",
  "bank of america": "BAC",
  bofa: "BAC",
  goldman: "GS",
  "goldman sachs": "GS",
  morgan: "MS",
  "morgan stanley": "MS",
  citigroup: "C",
  citi: "C",
  "wells fargo": "WFC",
  blackrock: "BLK",
  berkshire: "BRK-B",
  "berkshire hathaway": "BRK-B",
  exxon: "XOM",
  "exxon mobil": "XOM",
  chevron: "CVX",
  shell: "SHEL",
  bp: "BP",
  pfizer: "PFE",
  moderna: "MRNA",
  "johnson and johnson": "JNJ",
  "johnson & johnson": "JNJ",
  jnj: "JNJ",
  merck: "MRK",
  abbvie: "ABBV",
  lilly: "LLY",
  "eli lilly": "LLY",
  unitedhealth: "UNH",
  "united health": "UNH",
  cvs: "CVS",
  walgreens: "WBA",
  homedepot: "HD",
  "home depot": "HD",
  lowes: "LOW",
  target: "TGT",
  ford: "F",
  gm: "GM",
  "general motors": "GM",
  boeing: "BA",
  caterpillar: "CAT",
  ge: "GE",
  "general electric": "GE",
  "3m": "MMM",
  fedex: "FDX",
  ups: "UPS",
  att: "T",
  "at&t": "T",
  "at and t": "T",
  verizon: "VZ",
  comcast: "CMCSA",
  tmobile: "TMUS",
  "t mobile": "TMUS",
  "t-mobile": "TMUS",
};

// Patterns identifying derivative/wrapper products we want to push to the
// bottom (or out) of search results. We almost never want to score these
// when the user types a brand name — they want the underlying.
const DERIVATIVE_PRODUCT_PATTERN =
  /\b(ETF|ETP|ETN|Fund|Trust|Strategy|Yield|Tracker|Bull|Bear|Inverse|Leveraged|Tokenized|Option|Premium|Closed[- ]End|Note|Index)\b/i;

// Currencies that aren't actual equities.
const NON_EQUITY_CURRENCIES = new Set(["", "CRYPTO"]);

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

function normalizeAliasKey(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\binc\b\.?$/i, "")
    .replace(/\bcorp(?:oration)?\b\.?$/i, "")
    .replace(/\bcompany\b\.?$/i, "")
    .replace(/\bco\b\.?$/i, "")
    .trim();
}

/**
 * Search by either ticker prefix or company name. FMP exposes these as two
 * separate endpoints (/search-symbol and /search-name), so we query both in
 * parallel, merge, and dedupe by symbol so a user can type "AAPL" or "Apple"
 * and get the same result.
 *
 * Common brand names ("google", "facebook") are short-circuited via an alias
 * map because FMP's company-name search doesn't link them to the right ticker.
 * Derivative products (ETFs, ETPs, leveraged/inverse funds, strategy wrappers,
 * tokenized crypto) are filtered out so the user always lands on the
 * underlying equity when one exists.
 */
export async function searchSymbols(query: string, limit = 8): Promise<SearchMatch[]> {
  const q = query.trim();
  if (!q) return [];

  const aliasKey = normalizeAliasKey(q);
  const aliasTicker = ALIAS_TO_TICKER[aliasKey];

  const [symbolHits, nameHits] = await Promise.all([
    fmpSearch("search-symbol", q, limit).catch(() => [] as FmpSearchResp),
    fmpSearch("search-name", q, limit).catch(() => [] as FmpSearchResp),
  ]);

  const seen = new Set<string>();
  const merged: SearchMatch[] = [];

  // Symbol hits first — if the user typed a literal ticker prefix, that's the strongest signal.
  for (const d of [...symbolHits, ...nameHits]) {
    if (!d.symbol || seen.has(d.symbol)) continue;
    const currency = d.currency ?? "USD";
    if (NON_EQUITY_CURRENCIES.has(currency)) continue;
    if (DERIVATIVE_PRODUCT_PATTERN.test(d.name ?? "")) continue;
    seen.add(d.symbol);
    merged.push({
      symbol: d.symbol,
      name: d.name,
      exchange: d.exchange ?? d.exchangeFullName ?? "",
      currency,
    });
  }

  // Prefer US exchanges first, then USD-denominated, then everything else.
  merged.sort((a, b) => {
    // Alias hit wins above all else.
    if (aliasTicker && a.symbol === aliasTicker) return -1;
    if (aliasTicker && b.symbol === aliasTicker) return 1;
    const aPref = PREFERRED_EXCHANGES.has(a.exchange) ? 0 : 1;
    const bPref = PREFERRED_EXCHANGES.has(b.exchange) ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    if (a.currency === "USD" && b.currency !== "USD") return -1;
    if (b.currency === "USD" && a.currency !== "USD") return 1;
    return 0;
  });

  // If the alias map has a hit but FMP's search didn't surface it (e.g. "google"
  // → GOOGL where FMP returns nothing useful), inject it at the top.
  if (aliasTicker && !merged.some((m) => m.symbol === aliasTicker)) {
    merged.unshift({
      symbol: aliasTicker,
      name: aliasTicker,
      exchange: "NASDAQ",
      currency: "USD",
    });
  }

  return merged.slice(0, limit);
}

export async function findBestMatch(query: string): Promise<SearchMatch | null> {
  const matches = await searchSymbols(query, 5);
  return matches[0] ?? null;
}
