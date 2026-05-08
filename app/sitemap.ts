import type { MetadataRoute } from "next";
import popularTickers from "@/data/popular-tickers.json";
import sitemapTickers from "@/data/sitemap-tickers.json";
import { GLOSSARY } from "@/data/glossary";

const SITE = "https://qscoring.com";

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
  const all = Array.from(new Set([...(sitemapTickers as string[]), ...popular]));

  const tickerPages: MetadataRoute.Sitemap = all.sort().map((ticker) => ({
    url: `${SITE}/score/${ticker}`,
    lastModified: today,
    changeFrequency: "daily",
    priority: popular.has(ticker) ? 0.8 : 0.6,
  }));

  return [...staticPages, ...tickerPages];
}
