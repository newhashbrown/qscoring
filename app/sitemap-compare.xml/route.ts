import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";
import { CURATED_PAIRS, pairToSlug } from "@/lib/compare";

const SITE = "https://qscoring.com";

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const xml = urlsetXml([
    { loc: `${SITE}/compare`, lastmod: today },
    ...CURATED_PAIRS.map(([a, b]) => ({
      loc: `${SITE}/compare/${pairToSlug(a, b)}`,
      lastmod: today,
    })),
  ]);

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
