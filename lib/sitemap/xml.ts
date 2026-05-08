/**
 * XML emitters for the split sitemap setup. Kept tiny and dependency-free
 * — we only emit the two shapes the sitemap protocol defines: a urlset
 * (regular sitemap) and a sitemapindex (parent that points at child
 * sitemaps).
 */

export type UrlEntry = {
  loc: string;
  lastmod?: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
};

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

// XML 1.0 forbids only a small set of chars in element text. URLs that we
// generate are server-controlled and won't contain those, but we still
// escape '&' so a future ticker like 'A&B' can't ever break the document.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function urlsetXml(entries: readonly UrlEntry[]): string {
  const items = entries.map((e) => {
    const parts = [`    <loc>${escapeXml(e.loc)}</loc>`];
    if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
    if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (typeof e.priority === "number") {
      parts.push(`    <priority>${e.priority.toFixed(2)}</priority>`);
    }
    return `  <url>\n${parts.join("\n")}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.join("\n")}
</urlset>
`;
}

export function sitemapIndexXml(entries: readonly SitemapEntry[]): string {
  const items = entries.map((e) => {
    const parts = [`    <loc>${escapeXml(e.loc)}</loc>`];
    if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
    return `  <sitemap>\n${parts.join("\n")}\n  </sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.join("\n")}
</sitemapindex>
`;
}

export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  // 1 hour edge cache + 24h SWR — sitemaps don't change minute-to-minute.
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
} as const;
