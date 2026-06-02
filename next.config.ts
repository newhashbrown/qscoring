import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
