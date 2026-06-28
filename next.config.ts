import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework on every response.
  poweredByHeader: false,
  // Canonical URL shape: no trailing slash (the default, set explicitly so
  // /foo and /foo/ never both resolve). The www/http → https://qscoring.com
  // 301s are a Cloudflare redirect rule, not a Next concern.
  trailingSlash: false,
  // Cloudflare Workers can't run Sharp, so the /_next/image endpoint
  // returns source bytes unchanged but pays a Worker hop AND loses
  // edge caching (no cf-cache-status on the response). Disabling
  // optimization routes every <Image src="/foo.png"> straight through
  // the ASSETS binding, which is cached automatically. Revisit when
  // a Cloudflare Images integration is wired up via open-next.config.ts.
  images: {
    unoptimized: true,
  },
  // Security response headers for all SSR/HTML/API routes. public/_headers
  // only covers the static ASSETS binding, so these must live here to reach
  // Worker-rendered responses (security audit M2, 2026-06-23).
  async headers() {
    // CSP is shipped REPORT-ONLY first: static analysis can't fully enumerate
    // Clerk's runtime script/connect/frame needs (it injects dynamically and
    // pulls in Cloudflare Turnstile), so an enforced policy written blind would
    // risk breaking sign-in. Report-Only blocks nothing while surfacing real
    // violations in the browser console; validate against /, /score/[t],
    // /compare/[pair], a Giscus blog page, and the Clerk widget, widen to
    // exactly what's needed, THEN flip the header name to
    // "Content-Security-Policy". Nonces are intentionally avoided — they force
    // dynamic rendering and would break the static /performance and /movers
    // pages this app depends on.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      // 'unsafe-inline' covers Next's inline hydration scripts and the inline
      // GA config block; the real value here is constraining EXTERNAL script
      // origins. (Inline injection is defended at the source by
      // safeJsonLdString — see lib/json-ld.ts / finding M1.)
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://giscus.app https://challenges.cloudflare.com https://clerk.qscoring.com https://*.clerk.accounts.dev",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://www.google-analytics.com https://clerk.qscoring.com https://*.clerk.accounts.dev https://giscus.app",
      "frame-src https://giscus.app https://challenges.cloudflare.com https://clerk.qscoring.com https://*.clerk.accounts.dev",
      "worker-src 'self' blob:",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          // Enforced now — these are safe and cannot break the app.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // HSTS. Cloudflare already does Always-Use-HTTPS + www→apex 301, so
          // every subdomain is HTTPS-reachable — includeSubDomains is safe.
          // `preload` is intentionally omitted: submitting to the browser
          // preload list is a one-way door (hard to undo), so that's a separate
          // deliberate decision, ideally set at the Cloudflare edge (which also
          // covers the static ASSETS binding this Next header does not).
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Report-only until validated (see note above), then rename.
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
