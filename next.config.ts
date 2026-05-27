import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
