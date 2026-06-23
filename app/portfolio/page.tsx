import { safeJsonLdString } from "@/lib/json-ld";
import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import PortfolioAnalyzer from "./PortfolioAnalyzer";

export const metadata = {
  title: "Portfolio QScore Analysis — Factor Exposure for Your Holdings",
  description:
    "Paste any portfolio of US stocks and see the aggregate QScore, factor exposure, signal mix, sector concentration, and strongest/weakest holdings. Stateless — we don't store your holdings.",
  alternates: { canonical: "https://qscoring.com/portfolio" },
};

const portfolioJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": "https://qscoring.com/portfolio",
  name: "QScoring Portfolio Analyzer",
  description:
    "Free portfolio QScore analyzer — paste a list of US tickers and see the aggregate factor exposure, signal distribution, sector concentration, and strongest/weakest holdings.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function PortfolioPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(portfolioJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology portfolio-page">
        <header className="method-header">
          <p className="method-eyebrow">Portfolio</p>
          <h1>Analyze your portfolio with the QScore framework</h1>
          <p className="method-lede">
            Paste your holdings — up to 30 tickers, with optional weights — and see the aggregate
            QScore, factor exposure, signal mix, sector concentration, and which positions are
            pulling the composite up or down. Stateless by design: we don&apos;t store your
            holdings unless you explicitly opt into a future weekly digest.
          </p>
        </header>

        <PortfolioAnalyzer />

        <section className="portfolio-trust">
          <h2>What we do (and don&apos;t do) with your input</h2>
          <ul>
            <li>
              <strong>Compute the analysis on the fly.</strong> Each ticker is scored against the
              same five-factor model documented on the{" "}
              <Link href="/methodology">methodology page</Link>. Aggregate is a weighted average
              over the holdings you supplied.
            </li>
            <li>
              <strong>Don&apos;t store your input by default.</strong> The analysis runs in a
              single request-response and disappears when you close the tab. The page renders
              client-side so even browser back/forward doesn&apos;t leak your previous run to
              another user.
            </li>
            <li>
              <strong>Don&apos;t treat this as advice.</strong> A weighted-average factor score is
              a structured second opinion, not a verdict on whether your portfolio is &ldquo;good
              .&rdquo; The QScore framework doesn&apos;t know your tax situation, income needs,
              correlation to other assets, or risk tolerance.
            </li>
          </ul>
        </section>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/glossary">Glossary</Link>
          <span className="sep">·</span>
          <Link href="/scores">Categories</Link>
          <span className="sep">·</span>
          <Link href="/compare">Compare</Link>
          <span className="sep">·</span>
          <Link href="/score">Score a ticker</Link>
        </p>
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice, a recommendation, or a solicitation to buy or
          sell any security. Aggregate portfolio analysis is a weighted-average of individual
          factor scores and should not be interpreted as a portfolio recommendation.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
