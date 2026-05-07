import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/score", "/score/", "/methodology"],
        // Block the JSON API endpoints — they're for our frontend, not search
        // engines, and there's no SEO value in indexing them.
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://qscoring.com/sitemap.xml",
    host: "https://qscoring.com",
  };
}
