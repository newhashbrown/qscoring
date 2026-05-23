import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreNav from "@/app/components/ScoreNav";
import ScoreboardCard from "@/app/components/ScoreboardCard";
import {
  CATEGORIES,
  CATEGORIES_BY_SLUG,
  selectPicks,
  type ScoreboardPick,
} from "@/data/categories";
import scoreboardData from "@/data/scoreboard.json";
import { marketCloseLabel } from "@/lib/market-date";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const def = CATEGORIES_BY_SLUG[category];
  if (!def) {
    return {
      title: "Category not found — QScoring",
      description: "The requested QScore category could not be found.",
      robots: { index: false, follow: true },
    };
  }
  const url = `https://qscoring.com/scores/${def.slug}`;

  // Empty categories produce thin pages — indexing them dilutes site-wide
  // quality signal. follow stays true so internal links still pass.
  const scoreboard = scoreboardData.picks as ScoreboardPick[];
  const isEmpty = selectPicks(scoreboard, def.selector).length === 0;

  return {
    title: `${def.title} — QScore Rankings`,
    description: def.shortDescription,
    alternates: { canonical: url },
    robots: isEmpty ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${def.title} — QScore Rankings`,
      description: def.shortDescription,
      url,
      siteName: "QScoring",
      type: "website",
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const def = CATEGORIES_BY_SLUG[category];
  if (!def) notFound();

  const scoreboard = scoreboardData.picks as ScoreboardPick[];
  const picks = selectPicks(scoreboard, def.selector);
  const dateLabel = marketCloseLabel(scoreboardData.generatedAt);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `https://qscoring.com/scores/${def.slug}`,
    name: def.title,
    description: def.shortDescription,
    numberOfItems: picks.length,
    itemListElement: picks.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://qscoring.com/score/${p.ticker}`,
      name: `${p.ticker} ${p.companyName}`,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://qscoring.com/" },
      { "@type": "ListItem", position: 2, name: "Categories", item: "https://qscoring.com/scores" },
      {
        "@type": "ListItem",
        position: 3,
        name: def.title,
        item: `https://qscoring.com/scores/${def.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology category-page">
        <header className="method-header">
          <p className="method-eyebrow">
            <Link href="/scores">Categories</Link>
          </p>
          <h1>{def.title}</h1>
          <p className="method-lede">{def.shortDescription}</p>
          <p className="category-criteria">
            <strong>Criteria:</strong> {def.criteriaLabel} · {picks.length}{" "}
            {picks.length === 1 ? "name" : "names"} matching · snapshot from {dateLabel}
          </p>
        </header>

        <section className="category-intro">
          {def.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>

        {picks.length > 0 ? (
          <section className="scoreboard-grid" aria-label={`${def.title} ranked list`}>
            {picks.map((p) => (
              <ScoreboardCard key={p.ticker} pick={p} />
            ))}
          </section>
        ) : (
          <section className="category-empty">
            <p>
              No names in the scanned universe matched this criterion in today&apos;s scoreboard.
              The scoreboard rebuilds daily — check back tomorrow, or browse other{" "}
              <Link href="/scores">categories</Link>.
            </p>
          </section>
        )}

        <p className="back-to-top">
          <Link href="/scores">← All categories</Link>
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
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice, a recommendation, or a solicitation to buy or
          sell any security.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
