import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import { GLOSSARY, type GlossaryTerm } from "@/data/glossary";

export const metadata = {
  title: "Glossary — Quant Investing & QScore Terminology",
  description:
    "Plain-English definitions of QScore concepts (composite, signal, factor categories) and general quant finance terms (P/E, RSI, beta, Sharpe ratio, information coefficient).",
};

const glossaryJsonLd = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  "@id": "https://qscoring.com/glossary",
  name: "QScoring Glossary",
  description:
    "Plain-English definitions of QScore concepts and general quant finance terms.",
  hasDefinedTerm: GLOSSARY.map((t) => ({
    "@type": "DefinedTerm",
    "@id": `https://qscoring.com/glossary/${t.slug}`,
    name: t.title,
    description: t.short,
    url: `https://qscoring.com/glossary/${t.slug}`,
  })),
};

const CATEGORY_META: Record<GlossaryTerm["category"], { label: string; blurb: string }> = {
  qscore: {
    label: "QScore concepts",
    blurb: "Terms specific to how the QScore is built — what each factor measures, how scores combine, and what the signal and confidence labels mean.",
  },
  quant: {
    label: "Quant finance basics",
    blurb: "General terms from quantitative finance that show up across the methodology and the academic factor research it draws from.",
  },
};

export default function GlossaryPage() {
  const byCategory: Record<GlossaryTerm["category"], GlossaryTerm[]> = {
    qscore: [],
    quant: [],
  };
  for (const t of GLOSSARY) byCategory[t.category].push(t);
  for (const k of Object.keys(byCategory) as GlossaryTerm["category"][]) {
    byCategory[k].sort((a, b) => a.title.localeCompare(b.title));
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(glossaryJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology glossary-index">
        <header className="method-header">
          <p className="method-eyebrow">Glossary</p>
          <h1>Quant investing terms, in plain English</h1>
          <p className="method-lede">
            Definitions for the concepts behind every QScore — what each factor measures, how
            scores are normalized, what the signal labels mean — alongside a short reference for the
            general quant finance terms (P/E, RSI, beta, Sharpe, information coefficient) that show
            up in the methodology.
          </p>
        </header>

        {(Object.keys(byCategory) as GlossaryTerm["category"][]).map((cat) => (
          <section key={cat} className="glossary-section">
            <h2>{CATEGORY_META[cat].label}</h2>
            <p className="glossary-cat-blurb">{CATEGORY_META[cat].blurb}</p>
            <ul className="glossary-list">
              {byCategory[cat].map((t) => (
                <li key={t.slug}>
                  <Link href={`/glossary/${t.slug}`} className="glossary-list-item">
                    <span className="glossary-term">{t.title}</span>
                    <span className="glossary-short">{t.short}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="back-to-top">
          <Link href="/methodology">Read the full methodology →</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <a href="/methodology">Methodology</a>
          <span className="sep">·</span>
          <a href="/score">Score a ticker</a>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
