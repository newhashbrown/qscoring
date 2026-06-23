import { safeJsonLdString } from "@/lib/json-ld";
import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import CompareForm, { type UniverseEntry } from "@/app/components/CompareForm";
import { CURATED_PAIRS, pairToSlug } from "@/lib/compare";
import scoreboardData from "@/data/scoreboard.json";
import compareUniverseData from "@/data/compare-universe.json";
import type { ScoreboardPick } from "@/data/categories";
import { marketCloseLabel } from "@/lib/market-date";

export const metadata = {
  title: "Compare Stocks Side by Side — QScore",
  description:
    "Side-by-side QScore comparisons for popular ticker pairs: NVDA vs AMD, AAPL vs MSFT, GOOGL vs META, and more.",
  alternates: { canonical: "https://qscoring.com/compare" },
};

const collectionJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://qscoring.com/compare",
  name: "QScore Comparisons",
  description: "Curated side-by-side ticker comparisons using the QScore framework.",
  hasPart: CURATED_PAIRS.map(([a, b]) => ({
    "@type": "WebPage",
    name: `${a} vs ${b}`,
    url: `https://qscoring.com/compare/${pairToSlug(a, b)}`,
  })),
};

function findPick(ticker: string): ScoreboardPick | undefined {
  return (scoreboardData.picks as ScoreboardPick[]).find((p) => p.ticker === ticker);
}

// Universe is the source-of-truth allow-list from data/compare-universe.json,
// NOT the scoreboard output. scoreboard.json can transiently drop names when
// /api/score returns a non-retryable error in the cron (this happened to AAPL
// on 2026-05-25). For entries in the universe but missing from scoreboard,
// /compare/[pair] already falls back to live scoreTicker(), so the form gate
// stays consistent with what the destination page can actually render.
const UNIVERSE: ReadonlyArray<UniverseEntry> = (compareUniverseData.entries as UniverseEntry[])
  .slice()
  .sort((x, y) => x.symbol.localeCompare(y.symbol));

export default function CompareIndexPage() {
  const dateLabel = marketCloseLabel(scoreboardData.generatedAt);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(collectionJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology compare-index">
        <header className="method-header">
          <p className="method-eyebrow">Compare</p>
          <h1>Side-by-side QScore comparisons</h1>
          <p className="method-lede">
            Compare any two US-listed equities on the same value / growth / momentum / profitability /
            risk framework. Type two tickers below, or pick from the curated head-to-head pairs — the
            URL pattern is <code>/compare/AAA-vs-BBB</code> if you want to deep-link directly.
          </p>
        </header>

        <CompareForm universe={UNIVERSE} />

        <h2 className="compare-section-heading">Curated pairs</h2>
        <ul className="compare-pairs-list">
          {CURATED_PAIRS.map(([a, b]) => {
            const pickA = findPick(a);
            const pickB = findPick(b);
            return (
              <li key={`${a}-${b}`}>
                <Link href={`/compare/${pairToSlug(a, b)}`} className="compare-pair-row">
                  <span className="compare-pair-ticker">
                    {a}
                    {pickA ? <span className="compare-pair-score"> {pickA.composite}</span> : null}
                  </span>
                  <span className="compare-pair-vs">vs</span>
                  <span className="compare-pair-ticker">
                    {b}
                    {pickB ? <span className="compare-pair-score"> {pickB.composite}</span> : null}
                  </span>
                  <span className="compare-pair-arrow">→</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="back-to-top">
          Snapshot from {dateLabel} · refreshed daily
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/scores">Categories</Link>
          <span className="sep">·</span>
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/glossary">Glossary</Link>
          <span className="sep">·</span>
          <Link href="/score">Score a ticker</Link>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
