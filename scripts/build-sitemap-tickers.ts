/**
 * Builds data/sitemap-tickers.json — the comprehensive list of US-listed
 * tickers we want indexed in our sitemap. Single FMP screener call.
 *
 * Run with:  npm run sitemap-tickers
 */
import * as fs from "node:fs";
import * as path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const MIN_MARKET_CAP = 250_000_000; // $250M floor — small-cap and up
const FETCH_LIMIT = 5000;

type ScreenerRow = {
  symbol: string;
  companyName: string;
  marketCap: number;
  sector?: string;
  industry?: string;
  exchange?: string;
  exchangeShortName?: string;
  isEtf?: boolean;
  isFund?: boolean;
  isActivelyTrading?: boolean;
};

const ALLOWED_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
  "AMEX",
  "ARCA",
  "BATS",
  "CBOE",
]);

// Drop derivative wrapper products by name pattern. Same regex used in our
// search filter so behavior is consistent across the app.
const DERIVATIVE_PATTERN =
  /\b(ETF|ETP|ETN|Fund|Trust|Strategy|Yield|Tracker|Bull|Bear|Inverse|Leveraged|Tokenized|Option|Premium|Closed[- ]End|Note|Index|REIT)\b/i;

// Tickers with these characters are foreign or special listings we can't
// reliably score on the FMP plan. The standard US class-share form (BRK-B,
// BF-B) uses a hyphen which we keep.
const ODD_TICKER = /[^A-Z0-9.-]/;

async function main() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY not set in .env");

  const url = new URL("https://financialmodelingprep.com/stable/company-screener");
  url.searchParams.set("marketCapMoreThan", String(MIN_MARKET_CAP));
  url.searchParams.set("isActivelyTrading", "true");
  url.searchParams.set("country", "US");
  url.searchParams.set("exchange", "NASDAQ,NYSE");
  url.searchParams.set("limit", String(FETCH_LIMIT));
  url.searchParams.set("apikey", apiKey);

  console.log(`Fetching screener (cap ≥ $${MIN_MARKET_CAP / 1e6}M)...`);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Screener failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const rows = (await res.json()) as ScreenerRow[];
  console.log(`  → ${rows.length} raw rows`);

  const filtered = rows
    .filter((r) => {
      if (!r.symbol) return false;
      if (ODD_TICKER.test(r.symbol)) return false;
      if (r.isEtf || r.isFund) return false;
      const exchange = r.exchangeShortName ?? r.exchange ?? "";
      if (!ALLOWED_EXCHANGES.has(exchange)) return false;
      if (DERIVATIVE_PATTERN.test(r.companyName ?? "")) return false;
      return true;
    })
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  console.log(`  → ${filtered.length} after filter (US equities only)`);

  const symbols = Array.from(new Set(filtered.map((r) => r.symbol)));
  const outPath = path.resolve(process.cwd(), "data", "sitemap-tickers.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(symbols, null, 2));
  console.log(`Wrote ${outPath}: ${symbols.length} tickers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
