import fs from "node:fs";
import path from "node:path";
import { urlsetXml, SITEMAP_HEADERS } from "@/lib/sitemap/xml";
import { BLOG_POSTS, CLUSTER_SLUGS } from "@/data/blog-posts";

const SITE = "https://qscoring.com";
const RECAPS_DIR = path.resolve(process.cwd(), "data", "recaps");

export const revalidate = 3600;

function listRecapDates(): string[] {
  if (!fs.existsSync(RECAPS_DIR)) return [];
  return fs
    .readdirSync(RECAPS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""));
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const recapDates = listRecapDates();

  const xml = urlsetXml([
    {
      loc: `${SITE}/blog`,
      lastmod: today,
      changefreq: "weekly" as const,
      priority: 0.85,
    },
    ...CLUSTER_SLUGS.map((slug) => ({
      loc: `${SITE}/blog/${slug}`,
      lastmod: today,
      changefreq: "weekly" as const,
      priority: 0.8,
    })),
    {
      loc: `${SITE}/blog/recaps`,
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
    ...recapDates.map((d) => ({
      loc: `${SITE}/blog/recaps/${d}`,
      lastmod: d,
      changefreq: "monthly" as const,
      priority: 0.7,
    })),
  ]);

  return new Response(xml, { headers: SITEMAP_HEADERS });
}
