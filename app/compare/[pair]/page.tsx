import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreNav from "@/app/components/ScoreNav";
import { scoreTicker } from "@/lib/scoring";
import {
  CURATED_PAIRS,
  buildComparisonRows,
  keyReason,
  pairToSlug,
  parsePairSlug,
  type CompareSide,
} from "@/lib/compare";
import scoreboardData from "@/data/scoreboard.json";
import type { ScoreboardPick } from "@/data/categories";
import { marketCloseLabel } from "@/lib/market-date";

export function generateStaticParams() {
  return CURATED_PAIRS.map(([a, b]) => ({ pair: pairToSlug(a, b) }));
}

const VERDICT_CLASS: Record<"a" | "b" | "tie", string> = {
  a: "winner-a",
  b: "winner-b",
  tie: "tie",
};

async function loadSide(ticker: string): Promise<CompareSide | null> {
  // Scoreboard hit — instant, zero FMP load.
  const fromScoreboard = (scoreboardData.picks as ScoreboardPick[]).find(
    (p) => p.ticker === ticker
  );
  if (fromScoreboard && typeof fromScoreboard.longTermScore === "number" &&
      typeof fromScoreboard.shortTermScore === "number") {
    return fromScoreboard as CompareSide;
  }

  // Fallback: live score for tickers outside the universe. Costs ~6 FMP
  // calls but underlying fetches are cached, so repeat hits are free.
  try {
    const r = await scoreTicker(ticker);
    return {
      ticker: r.ticker,
      companyName: r.companyName,
      price: r.price,
      changePercent: r.changePercent,
      composite: Math.round(r.composite),
      signal: r.signal,
      confidence: r.confidence,
      longTermScore: Math.round(r.longTermScore),
      shortTermScore: Math.round(r.shortTermScore),
      categories: r.categories.map((c) => ({
        name: c.name,
        label: c.label,
        score: Math.round(c.score),
      })),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const parsed = parsePairSlug(pair);
  if (!parsed) {
    return {
      title: "Comparison not found — QScoring",
      description: "The requested ticker comparison could not be parsed.",
      robots: { index: false, follow: true },
    };
  }
  const [a, b] = parsed;
  const url = `https://qscoring.com/compare/${pairToSlug(a, b)}`;
  const title = `${a} vs ${b} — QScore Comparison`;
  const description =
    `Side-by-side QScore breakdown of ${a} and ${b}: composite, signal, long-term and ` +
    `short-term scores, plus value, growth, momentum, profitability, and risk.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "QScoring", type: "article" },
  };
}

export default async function CompareTickersPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const parsed = parsePairSlug(pair);
  if (!parsed) notFound();
  const [tickerA, tickerB] = parsed;

  const [a, b] = await Promise.all([loadSide(tickerA), loadSide(tickerB)]);
  if (!a || !b) notFound();

  const rows = buildComparisonRows(a, b);
  const reason = keyReason(a, b);
  const dateLabel = marketCloseLabel(scoreboardData.generatedAt);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `https://qscoring.com/compare/${pairToSlug(a.ticker, b.ticker)}`,
    name: `${a.ticker} vs ${b.ticker} — QScore Comparison`,
    description: `Side-by-side QScore comparison of ${a.companyName} (${a.ticker}) and ${b.companyName} (${b.ticker}).`,
    about: [
      { "@type": "Corporation", name: a.companyName, tickerSymbol: a.ticker },
      { "@type": "Corporation", name: b.companyName, tickerSymbol: b.ticker },
    ],
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://qscoring.com/" },
      { "@type": "ListItem", position: 2, name: "Compare", item: "https://qscoring.com/compare" },
      {
        "@type": "ListItem",
        position: 3,
        name: `${a.ticker} vs ${b.ticker}`,
        item: `https://qscoring.com/compare/${pairToSlug(a.ticker, b.ticker)}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology compare-page">
        <header className="method-header">
          <p className="method-eyebrow">
            <Link href="/compare">Compare</Link>
          </p>
          <h1>
            {a.ticker} <span className="vs">vs</span> {b.ticker}
          </h1>
          <p className="method-lede">
            QScore side-by-side for {a.companyName} ({a.ticker}) and {b.companyName} ({b.ticker}).
            Snapshot from {dateLabel} · refreshed daily.
          </p>
        </header>

        <section className="compare-verdict">
          <p className="verdict-label">QScore verdict</p>
          <p className="verdict-text">{reason}</p>
        </section>

        <section className="compare-table" aria-label={`${a.ticker} vs ${b.ticker} comparison`}>
          <div className="compare-row compare-head">
            <div className="compare-cell metric-label">Metric</div>
            <div className="compare-cell ticker-col">
              <span className="ticker-symbol">{a.ticker}</span>
              <span className="ticker-name">{a.companyName}</span>
            </div>
            <div className="compare-cell ticker-col">
              <span className="ticker-symbol">{b.ticker}</span>
              <span className="ticker-name">{b.companyName}</span>
            </div>
          </div>

          <div className="compare-row">
            <div className="compare-cell metric-label">Signal</div>
            <div className="compare-cell value">{signalLabel(a)}</div>
            <div className="compare-cell value">{signalLabel(b)}</div>
          </div>

          <div className="compare-row">
            <div className="compare-cell metric-label">Confidence</div>
            <div className="compare-cell value">{a.confidence}</div>
            <div className="compare-cell value">{b.confidence}</div>
          </div>

          <div className="compare-row">
            <div className="compare-cell metric-label">Price</div>
            <div className="compare-cell value">{formatPrice(a.price, a.changePercent)}</div>
            <div className="compare-cell value">{formatPrice(b.price, b.changePercent)}</div>
          </div>

          {rows.map((r) => (
            <div key={r.label} className={`compare-row score-row ${VERDICT_CLASS[r.verdict]}`}>
              <div className="compare-cell metric-label">{r.label}</div>
              <div
                className={`compare-cell value ${r.verdict === "a" ? "wins" : r.verdict === "tie" ? "ties" : ""}`}
              >
                {r.aValue}
              </div>
              <div
                className={`compare-cell value ${r.verdict === "b" ? "wins" : r.verdict === "tie" ? "ties" : ""}`}
              >
                {r.bValue}
              </div>
            </div>
          ))}
        </section>

        <section className="compare-actions">
          <Link href={`/score/${a.ticker}`} className="compare-action-btn">
            View {a.ticker} full breakdown →
          </Link>
          <Link href={`/score/${b.ticker}`} className="compare-action-btn">
            View {b.ticker} full breakdown →
          </Link>
        </section>

        <p className="back-to-top">
          <Link href="/compare">← All comparisons</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/compare">Compare</Link>
          <span className="sep">·</span>
          <Link href="/scores">Categories</Link>
          <span className="sep">·</span>
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/glossary">Glossary</Link>
        </p>
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}

function signalLabel(p: CompareSide): string {
  return {
    BUY_LONG_TERM: "Buy Long-Term",
    BUY_SHORT_TERM: "Buy Short-Term",
    HOLD: "Hold",
    SHORT: "Short",
  }[p.signal];
}

function formatPrice(price: number, changePct: number): string {
  const sign = changePct >= 0 ? "+" : "";
  return `$${price.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
}
