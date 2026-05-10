import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import MarketStrip from "./components/MarketStrip";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetBrainsMono.variable}`}>
      <body>
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
