import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";
import { GLOSSARY } from "@/data/glossary";

const SITE = "https://qscoring.com";

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const xml = urlsetXml(
    GLOSSARY.map((t) => ({
      loc: `${SITE}/glossary/${t.slug}`,
      lastmod: today,
    }))
  );

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
