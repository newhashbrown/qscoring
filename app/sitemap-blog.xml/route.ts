import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";
import { BLOG_POSTS } from "@/data/blog-posts";

const SITE = "https://qscoring.com";

export const revalidate = 3600;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const xml = urlsetXml([
    {
      loc: `${SITE}/blog`,
      lastmod: today,
      changefreq: "weekly" as const,
      priority: 0.85,
    },
    ...BLOG_POSTS.map((p) => ({
      loc: `${SITE}/blog/${p.slug}`,
      lastmod: p.publishedAt,
      changefreq: "monthly" as const,
      priority: 0.75,
    })),
  ]);

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
