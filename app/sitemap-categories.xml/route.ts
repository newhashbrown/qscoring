import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";
import { CATEGORIES } from "@/data/categories";

const SITE = "https://qscoring.com";

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const xml = urlsetXml([
    { loc: `${SITE}/scores`, lastmod: today },
    ...CATEGORIES.map((c) => ({
      loc: `${SITE}/scores/${c.slug}`,
      lastmod: today,
    })),
  ]);

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
