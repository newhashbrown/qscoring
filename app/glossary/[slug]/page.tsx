import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreNav from "@/app/components/ScoreNav";
import {
  GLOSSARY,
  GLOSSARY_BY_SLUG,
  getRelatedTerms,
  type GlossaryTerm,
} from "@/data/glossary";

export function generateStaticParams() {
  return GLOSSARY.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const term = GLOSSARY_BY_SLUG[slug];
  if (!term) {
    return {
      title: "Term not found — QScoring Glossary",
      description: "The requested glossary term could not be found.",
    };
  }
  return {
    title: `${term.title} — QScoring Glossary`,
    description: term.short,
    alternates: { canonical: `https://qscoring.com/glossary/${term.slug}` },
  };
}

// Inline link parser for [text](/url) syntax inside paragraph strings.
// Anything between square brackets becomes a Next <Link>; everything else
// renders as plain text. This keeps glossary content as plain strings while
// still letting individual paragraphs cross-link to other terms or anchors.
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <Link key={`${keyPrefix}-${i}`} href={match[2]}>
        {match[1]}
      </Link>
    );
    lastIndex = match.index + match[0].length;
    i++;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function termJsonLd(term: GlossaryTerm) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `https://qscoring.com/glossary/${term.slug}`,
    name: term.title,
    description: term.short,
    url: `https://qscoring.com/glossary/${term.slug}`,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      "@id": "https://qscoring.com/glossary",
      name: "QScoring Glossary",
      url: "https://qscoring.com/glossary",
    },
  };
}

export default async function GlossaryTermPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const term = GLOSSARY_BY_SLUG[slug];
  if (!term) notFound();

  const related = getRelatedTerms(term);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://qscoring.com/" },
      { "@type": "ListItem", position: 2, name: "Glossary", item: "https://qscoring.com/glossary" },
      {
        "@type": "ListItem",
        position: 3,
        name: term.title,
        item: `https://qscoring.com/glossary/${term.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(termJsonLd(term)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology glossary-term">
        <header className="method-header">
          <p className="method-eyebrow">
            <Link href="/glossary">Glossary</Link>
          </p>
          <h1>{term.title}</h1>
          <p className="method-lede">{term.short}</p>
        </header>

        <section>
          <h2>Definition</h2>
          {term.definition.map((p, i) => (
            <p key={`def-${i}`}>{renderInline(p, `def-${i}`)}</p>
          ))}
        </section>

        {term.formula && (
          <section className="glossary-formula-section">
            <h2>Formula</h2>
            <pre className="glossary-formula" aria-label={`${term.title} formula`}>
              <code>{term.formula.display}</code>
            </pre>
            {term.formula.explanation && (
              <p>{renderInline(term.formula.explanation, "formula")}</p>
            )}
          </section>
        )}

        <section>
          <h2>How QScoring uses it</h2>
          {term.inQScoring.map((p, i) => (
            <p key={`use-${i}`}>{renderInline(p, `use-${i}`)}</p>
          ))}
        </section>

        {related.length > 0 && (
          <section className="glossary-related">
            <h2>Related terms</h2>
            <ul className="glossary-related-list">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/glossary/${r.slug}`} className="glossary-chip">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="back-to-top">
          <Link href="/glossary">← Back to glossary</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <a href="/glossary">Glossary</a>
          <span className="sep">·</span>
          <a href="/methodology">Methodology</a>
          <span className="sep">·</span>
          <a href="/score">Score a ticker</a>
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
