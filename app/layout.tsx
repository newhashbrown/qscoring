import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import MarketStrip from "./components/MarketStrip";
import "./globals.css";

// Google Analytics 4 measurement ID. Not a secret — it ships to the client
// on every page — so it lives inline rather than in an env var.
const GA_MEASUREMENT_ID = "G-QYFXX5T71Z";

// Only load GA in production builds so local dev and preview traffic never
// pollutes the analytics property. NODE_ENV is "development" under `next dev`
// and "production" in the deployed Cloudflare build.
const GA_ENABLED = process.env.NODE_ENV === "production";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "QScoring — Instant Quant Scores for Any Stock",
  description:
    "Enter any ticker. Get a data-driven Quant Score and clear buy, hold, or short signal in seconds. No noise. No guesswork.",
  metadataBase: new URL("https://qscoring.com"),
  openGraph: {
    title: "QScoring — Instant Quant Scores for Any Stock",
    description:
      "Enter any ticker. Get a data-driven Quant Score and clear buy, hold, or short signal in seconds.",
    url: "https://qscoring.com",
    siteName: "QScoring",
    type: "website",
  },
  // Site-wide default Twitter card. Pages with their own image (score pages,
  // the homepage opengraph-image) override twitter:image automatically.
  twitter: {
    card: "summary_large_image",
    title: "QScoring — Instant Quant Scores for Any Stock",
    description:
      "Data-driven Quant Scores and clear buy, hold, or short signals for any US stock.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <body>
        {/* LCP-critical: nav logo. React 19 hoists this <link> into
            <head>, starting the fetch before the nav JSX renders.
            Logo bypasses /_next/image and serves as a cached static
            asset via the ASSETS binding — see public/_headers. */}
        <link
          rel="preload"
          as="image"
          href="/logo.webp"
          fetchPriority="high"
        />
        <ClerkProvider>
          {/* Brand/entity JSON-LD (Organization + WebSite) renders on the
              homepage only — see app/page.tsx — so the entity schema isn't
              duplicated on every route. */}
          {/* Market context strip — toggled by MARKET_STRIP_ENABLED in
              lib/feature-flags.ts. Wrapped in Suspense so a slow FMP
              response never blocks the rest of the page render. */}
          <Suspense fallback={null}>
            <MarketStrip />
          </Suspense>
          {children}
        </ClerkProvider>

        {/* Google Analytics (gtag.js) — production only, afterInteractive so
            it never blocks first paint. Loads site-wide via the root layout. */}
        {GA_ENABLED && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}

                // Consent Mode v2 defaults — set BEFORE gtag('js')/config.
                // Everything starts denied; a cookie banner must call
                // gtag('consent','update',{...}) to grant it (see PR notes —
                // no banner exists yet, so GA runs cookieless until one does).
                gtag('consent', 'default', {
                  'analytics_storage': 'denied',
                  'ad_storage': 'denied',
                  'ad_user_data': 'denied',
                  'ad_personalization': 'denied',
                  'wait_for_update': 500
                });

                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
