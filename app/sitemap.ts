import type { MetadataRoute } from "next";
import popularTickers from "@/data/popular-tickers.json";
import sitemapTickers from "@/data/sitemap-tickers.json";
import { GLOSSARY } from "@/data/glossary";

const SITE = "https://qscoring.com";

// Preferred-share series (CTA-PA, EFC-PC, JXN-PA, OAK-PA/PB, etc.) come back
// from FMP with thin data — no analyst coverage, sparse fundamentals, no
// useful price chart. Excluding them from the sitemap stops Google from
// being asked to crawl pages that won't earn impressions and would otherwise
// dilute the site-wide quality signal.
//
// Common-share class suffixes like BRK-A and BRK-B are NOT preferred shares
// and remain in the sitemap — they're heavily traded and SEO-relevant.
const PREFERRED_SHARE_RE = /-P[A-Z]$/;
function isIndexableTicker(ticker: string): boolean {
  return !PREFERRED_SHARE_RE.test(ticker);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE}/`,
      lastModified: today,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE}/score`,
      lastModified: today,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE}/methodology`,
      lastModified: today,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${SITE}/glossary`,
      lastModified: today,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    ...GLOSSARY.map((t) => ({
      url: `${SITE}/glossary/${t.slug}`,
      lastModified: today,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  // Hand-curated popular tickers get the top priority — these are the names
  // people actually search for. Rest of the universe gets standard priority.
  const popular = new Set(popularTickers as string[]);
  const all = Array.from(new Set([...(sitemapTickers as string[]), ...popular]))
    .filter(isIndexableTicker);

  const tickerPages: MetadataRoute.Sitemap = all.sort().map((ticker) => ({
    url: `${SITE}/score/${ticker}`,
    lastModified: today,
    changeFrequency: "daily",
    priority: popular.has(ticker) ? 0.8 : 0.6,
  }));

  return [...staticPages, ...tickerPages];
}
