import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";

const SITE = "https://qscoring.com";

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const xml = urlsetXml([
    {
      loc: `${SITE}/`,
      lastmod: today,
      changefreq: "daily",
      priority: 1.0,
    },
    {
      loc: `${SITE}/score`,
      lastmod: today,
      changefreq: "daily",
      priority: 0.9,
    },
    {
      loc: `${SITE}/methodology`,
      lastmod: today,
      changefreq: "monthly",
      priority: 0.85,
    },
    {
      loc: `${SITE}/glossary`,
      lastmod: today,
      changefreq: "monthly",
      priority: 0.75,
    },
    {
      loc: `${SITE}/performance`,
      lastmod: today,
      changefreq: "daily",
      priority: 0.85,
    },
    {
      loc: `${SITE}/portfolio`,
      lastmod: today,
      changefreq: "monthly",
      priority: 0.9,
    },
  ]);

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
