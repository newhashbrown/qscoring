import type { MetadataRoute } from "next";
import popularTickers from "@/data/popular-tickers.json";

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
  ];

  // Dedupe and sort tickers so the output is stable across builds.
  const tickers = Array.from(new Set(popularTickers as string[])).sort();

  const tickerPages: MetadataRoute.Sitemap = tickers.map((ticker) => ({
    url: `${SITE}/score/${ticker}`,
    lastModified: today,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticPages, ...tickerPages];
}
