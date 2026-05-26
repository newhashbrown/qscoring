/**
 * Cross-checks our ticker universe against the Dow Jones Industrial Average,
 * the Nasdaq-100, and a representative sample of the S&P 500. Reports
 * coverage per data set so we can answer "do we have all of Dow, S&P,
 * and Nasdaq?"
 */
const fs = require("node:fs");
const popular = new Set(require("../data/popular-tickers.json"));
const sitemap = new Set(require("../data/sitemap-tickers.json"));
const scoreboard = new Set(require("../data/scoreboard.json").picks.map((p) => p.ticker));

// Dow 30 (current composition as of late 2024 / 2025; AMZN replaced WBA Feb 2024;
// NVDA + SHW replaced INTC + DOW Nov 2024)
const DOW_30 = [
  "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
  "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
  "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
];

// Nasdaq-100 (December 2024 reconstitution composition; ~101 names due to
// dual-class share counts). Sourced from public Nasdaq listings.
const NASDAQ_100 = [
  "AAPL","ABNB","ADBE","ADI","ADP","ADSK","AEP","AMAT","AMD","AMGN","AMZN",
  "ANSS","APP","ARM","ASML","AVGO","AXON","AZN","BIIB","BKNG","BKR","CCEP",
  "CDNS","CDW","CEG","CHTR","CMCSA","COST","CPRT","CRWD","CSCO","CSGP","CSX",
  "CTAS","CTSH","DASH","DDOG","DLTR","DXCM","EA","EXC","FANG","FAST","FI",
  "FTNT","GEHC","GFS","GILD","GOOG","GOOGL","HON","IDXX","INTC","INTU","ISRG",
  "KDP","KHC","KLAC","LIN","LRCX","LULU","MAR","MCHP","MDB","MDLZ","MELI",
  "META","MNST","MRVL","MSFT","MSTR","MU","NFLX","NVDA","NXPI","ODFL","ON",
  "ORLY","PANW","PAYX","PCAR","PDD","PEP","PLTR","PYPL","QCOM","REGN","ROP",
  "ROST","SBUX","SNPS","TEAM","TMUS","TSLA","TTD","TTWO","TXN","VRSK","VRTX",
  "WBD","WDAY","XEL","ZS",
];

// S&P 500 — too long to inline. Use a representative sample of well-known
// names spanning sectors + market-cap tiers, plus the entire Dow 30 (since
// every Dow component is in the S&P 500).
// 100 names sampled from across S&P 500 sectors:
const SP500_SAMPLE = [
  // Mega-caps (top 50 by weight)
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","BRK-B","TSLA","AVGO",
  "LLY","JPM","WMT","XOM","UNH","MA","V","PG","JNJ","HD",
  "ORCL","COST","BAC","ABBV","KO","CVX","NFLX","CRM","TMUS","PEP",
  "AMD","CSCO","WFC","ACN","ABT","LIN","MRK","ADBE","NOW","QCOM",
  "GE","DIS","TXN","INTC","IBM","MCD","CAT","INTU","T","VZ",
  // Sector representatives mid-cap S&P 500
  "GS","MS","BLK","SCHW","SPGI","ICE","CME","PNC","TFC","USB",
  "JNJ","PFE","ABBV","BMY","TMO","DHR","ABT","UNH","CI","CVS",
  "WMT","COST","TGT","HD","LOW","MCD","SBUX","NKE","TJX","BKNG",
  "BA","HON","RTX","UNP","UPS","FDX","DE","CAT","MMM","ITW",
  "XOM","CVX","COP","PSX","SLB","EOG","OXY","WMB","KMI","OKE",
];

function pct(n, total) {
  return ((n / total) * 100).toFixed(1);
}

function check(label, list, set) {
  const have = list.filter((t) => set.has(t));
  const missing = list.filter((t) => !set.has(t));
  return { label, total: list.length, have: have.length, missing };
}

function report(name, list) {
  console.log(`\n=== ${name} (${list.length} tickers) ===`);
  for (const set of [
    { label: "popular-tickers.json (curated)", set: popular },
    { label: "sitemap-tickers.json (mid+large cap universe)", set: sitemap },
    { label: "scoreboard.json (currently scored)", set: scoreboard },
  ]) {
    const r = check(set.label, list, set.set);
    console.log(`  ${set.label}: ${r.have}/${r.total} (${pct(r.have, r.total)}%)`);
    if (r.missing.length > 0 && r.missing.length <= 30) {
      console.log(`    missing: ${r.missing.join(", ")}`);
    } else if (r.missing.length > 30) {
      console.log(`    missing (${r.missing.length}): ${r.missing.slice(0, 25).join(", ")}, ...`);
    }
  }
}

console.log(`Universe sizes:`);
console.log(`  popular-tickers: ${popular.size}`);
console.log(`  sitemap-tickers: ${sitemap.size}`);
console.log(`  scoreboard: ${scoreboard.size}`);

report("Dow Jones Industrial Average (Dow 30)", DOW_30);
report("Nasdaq-100", NASDAQ_100);
report("S&P 500 sample (~100 names)", [...new Set(SP500_SAMPLE)]);
