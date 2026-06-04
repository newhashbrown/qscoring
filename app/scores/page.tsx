import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import { CATEGORIES } from "@/data/categories";
import scoreboardData from "@/data/scoreboard.json";
import { marketCloseLabel } from "@/lib/market-date";

export const metadata = {
  title: "QScore Stock Categories — AI, Tech, Momentum, and More",
  description:
    "Browse stocks grouped by QScore signal and factor profile: AI stocks, large-cap tech, high-momentum names, Buy Short-Term picks, and high-growth-low-value plays.",
  alternates: { canonical: "https://qscoring.com/scores" },
  openGraph: {
    title: "QScore Stock Categories — AI, Tech, Momentum, and More",
    description:
      "Browse stocks grouped by QScore signal and factor profile: AI stocks, large-cap tech, high-momentum names, Buy Short-Term picks, and high-growth-low-value plays.",
    url: "https://qscoring.com/scores",
    siteName: "QScoring",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QScore Stock Categories — AI, Tech, Momentum & More",
    description:
      "Stocks grouped by QScore signal and factor profile — AI, tech, momentum, Buy picks, and more.",
  },
};

const collectionJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://qscoring.com/scores",
  name: "QScore Stock Categories",
  description:
    "Stock categories grouped by QScore signal and factor profile, each linking to the full set of names that match.",
  hasPart: CATEGORIES.map((c) => ({
    "@type": "WebPage",
    "@id": `https://qscoring.com/scores/${c.slug}`,
    name: c.title,
    description: c.shortDescription,
    url: `https://qscoring.com/scores/${c.slug}`,
  })),
};

export default function ScoresIndexPage() {
  // Display the US market close date the snapshot reflects, not the raw
  // UTC date of the script run — see lib/market-date.ts for the rationale.
  const dateLabel = marketCloseLabel(scoreboardData.generatedAt);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology scores-index">
        <header className="method-header">
          <p className="method-eyebrow">Categories</p>
          <h1>Browse stocks by QScore signal and factor</h1>
          <p className="method-lede">
            Curated and signal-driven groupings of US large-cap equities, scored on the same value /
            growth / momentum / profitability / risk framework as every individual ticker page.
            Every list links through to the full QScore breakdown — pick a category to explore.
          </p>
        </header>

        <ul className="categories-list">
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/scores/${c.slug}`} className="categories-list-item">
                <span className="categories-title">{c.title}</span>
                <span className="categories-blurb">{c.shortDescription}</span>
                <span className="categories-meta">{c.criteriaLabel}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="back-to-top">
          Snapshot from {dateLabel} · refreshed daily
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <a href="/methodology">Methodology</a>
          <span className="sep">·</span>
          <a href="/glossary">Glossary</a>
          <span className="sep">·</span>
          <a href="/score">Score a ticker</a>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
