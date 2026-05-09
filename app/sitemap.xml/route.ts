import { sitemapIndexXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";

const SITE = "https://qscoring.com";

// Edge-cache the sitemap index for 1h. Re-emits with today's lastmod on
// each rebuild — child sitemaps own their own cache windows and lastmod
// values, so the index doesn't need finer freshness than this.
export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const xml = sitemapIndexXml([
    { loc: `${SITE}/sitemap-static.xml`, lastmod: today },
    { loc: `${SITE}/sitemap-blog.xml`, lastmod: today },
    { loc: `${SITE}/sitemap-categories.xml`, lastmod: today },
    { loc: `${SITE}/sitemap-compare.xml`, lastmod: today },
    { loc: `${SITE}/sitemap-glossary.xml`, lastmod: today },
    { loc: `${SITE}/sitemap-scores-core.xml`, lastmod: today },
    { loc: `${SITE}/sitemap-scores-longtail.xml`, lastmod: today },
  ]);

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
