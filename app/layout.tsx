import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import MarketStrip from "./components/MarketStrip";
import "./globals.css";

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
};

// Site-wide Organization schema — gives Google a stable entity to attach
// brand-name SERPs, Knowledge Graph entries, and logo rich results to.
// Finance is YMYL, so entity recognition matters more than for generic sites.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://qscoring.com/#org",
  name: "QScoring",
  url: "https://qscoring.com",
  logo: "https://qscoring.com/logo.png",
  description:
    "Quantitative stock scoring with transparent methodology: value, growth, momentum, profitability, and risk factors combined into a single QScore.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {/* Market context strip — toggled by MARKET_STRIP_ENABLED in
            lib/feature-flags.ts. Wrapped in Suspense so a slow FMP
            response never blocks the rest of the page render. */}
        <Suspense fallback={null}>
          <MarketStrip />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
