import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Only /api/* is blocked — the JSON endpoints feed our frontend,
        // not search engines. Everything else is allowed by default;
        // explicit Allow rules are unnecessary unless overriding Disallow.
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://qscoring.com/sitemap.xml",
    host: "https://qscoring.com",
  };
}
