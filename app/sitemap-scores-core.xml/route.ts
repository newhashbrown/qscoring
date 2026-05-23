import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";
import popularTickers from "@/data/popular-tickers.json";

const SITE = "https://qscoring.com";

// Preferred-share series come back from FMP with thin data. Common share
// classes (BRK-A, BRK-B) are NOT preferred and remain in the sitemap.
const PREFERRED_SHARE_RE = /-P[A-Z]$/;

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const tickers = (popularTickers as string[])
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
