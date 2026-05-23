import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";

const SITE = "https://qscoring.com";

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  // changefreq and priority are ignored by major search engines (Google
  // publicly stated this) — keep only loc and lastmod.
  const xml = urlsetXml([
    { loc: `${SITE}/`, lastmod: today },
    { loc: `${SITE}/score`, lastmod: today },
    { loc: `${SITE}/methodology`, lastmod: today },
    { loc: `${SITE}/glossary`, lastmod: today },
    { loc: `${SITE}/performance`, lastmod: today },
    { loc: `${SITE}/portfolio`, lastmod: today },
  ]);

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
