import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";
import popularTickers from "@/data/popular-tickers.json";
import sitemapTickers from "@/data/sitemap-tickers.json";

const SITE = "https://qscoring.com";

const PREFERRED_SHARE_RE = /-P[A-Z]$/;

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const popular = new Set(popularTickers as string[]);
  const tickers = (sitemapTickers as string[])
    .filter((t) => !popular.has(t))
    .filter((t) => !PREFERRED_SHARE_RE.test(t))
    .sort();

  const xml = urlsetXml(
    tickers.map((ticker) => ({
      loc: `${SITE}/score/${ticker}`,
      lastmod: today,
    }))
  );

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
