import { safeJsonLdString } from "@/lib/json-ld";
import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import CrossSectionalRank from "@/app/components/CrossSectionalRank";
import { QSCORE_MODEL_VERSION } from "@/lib/scoring";

export const metadata = {
  title: "How QScoring Works — Multi-Factor Quant Stock Scoring",
  description:
    "How QScoring turns five factor families — value, growth, momentum, profitability, and risk — into one quantitative stock score using cross-sectional normalization and ranking. The multi-factor methodology, explained.",
  alternates: { canonical: "https://qscoring.com/how-it-works" },
  openGraph: {
    title: "How QScoring Works — Multi-Factor Quant Stock Scoring",
    description:
      "Five factor families, normalized cross-sectionally and ranked across the universe, combined into one QScore. A plain-English look at the methodology.",
    url: "https://qscoring.com/how-it-works",
    type: "article",
  },
};

const TOC = [
  { id: "idea", label: "The idea in one line" },
  { id: "factors", label: "The five factor families" },
  { id: "process", label: "From raw metric to ranked score" },
  { id: "composite", label: "Why a composite beats any single number" },
  { id: "grounding", label: "The academic grounding" },
  { id: "trust", label: "Why you can trust it before the track record" },
];

const FACTORS: Array<{ name: string; tag: string; body: string }> = [
  {
    name: "Value",
    tag: "What you pay for what you get",
    body: "Whether the market price looks rich or cheap relative to the business underneath it. The oldest idea in equity analysis, and the one that asks the simplest question: is this expensive?",
  },
  {
    name: "Growth",
    tag: "How fast the business is expanding",
    body: "Whether the company is getting bigger and more productive over time, rather than standing still. Growth and value often pull in opposite directions — which is exactly why both belong in the score.",
  },
  {
    name: "Momentum",
    tag: "What the market has been deciding",
    body: "Whether recent price behavior has been working for or against the stock. Captures the well-documented tendency of trends to persist over medium horizons — and the risk that they reverse.",
  },
  {
    name: "Profitability",
    tag: "How well it turns capital into profit",
    body: "Whether the business is genuinely efficient — converting its assets and equity into real earnings and cash — or merely growing for its own sake. A quality check on everything else.",
  },
  {
    name: "Risk",
    tag: "How turbulent the ride is",
    body: "How much the stock swings, and how tightly it moves with the broader market. Two companies with identical fundamentals are not equally attractive if one is twice as volatile.",
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What is a multi-factor stock score?",
    a: "A multi-factor score combines several independent, academically-studied dimensions of a stock — value, growth, momentum, profitability, and risk — into a single comparable number, instead of relying on any one metric in isolation.",
  },
  {
    q: "How is the QScore calculated, at a high level?",
    a: "Each underlying metric is normalized cross-sectionally — compared against the same metric for every other stock in the universe — then expressed as a relative rank. Those ranked factor views are combined into one composite QScore on a 1–100 scale, with a directional signal and a confidence rating.",
  },
  {
    q: "What is the QScore based on?",
    a: "Established factor-investing research. Each factor family corresponds to a body of peer-reviewed academic literature on the cross-section of equity returns. QScoring's contribution is the synthesis and the engineering, not the underlying factors themselves.",
  },
  {
    q: "Is the QScore investment advice?",
    a: "No. It is a quantitative, informational tool — a structured second opinion. It does not account for your taxes, time horizon, or risk tolerance, and nothing on the site constitutes a recommendation to buy or sell.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      headline: "How QScoring Works — Multi-Factor Quant Stock Scoring",
      description:
        "A conceptual explanation of QScoring's multi-factor methodology: five factor families normalized cross-sectionally, ranked across the universe, and combined into a single QScore.",
      author: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
      publisher: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
      mainEntityOfPage: { "@type": "WebPage", "@id": "https://qscoring.com/how-it-works" },
      about: { "@type": "Thing", name: "Multi-factor quantitative stock scoring" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function HowItWorksPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology how-it-works">
        <header className="method-header">
          <p className="method-eyebrow">How it works · QScore model {QSCORE_MODEL_VERSION}</p>
          <h1>How QScoring works: multi-factor stock scoring, explained</h1>
          <p className="method-lede">
            QScoring scores every stock the same way, on the same five dimensions, against the
            same universe — so the number you see is comparable across companies and sectors.
            This page explains the approach conceptually: what each factor captures, how raw
            numbers become a ranked score, and why a multi-factor composite is more durable than
            any single ratio.
          </p>
        </header>

        <nav className="method-toc" aria-label="On this page">
          <p className="toc-label">On this page</p>
          <ol>
            {TOC.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ─── THE IDEA ─── */}
        <section id="idea">
          <h2>The idea in one line</h2>
          <p>
            A stock&apos;s raw numbers — a price-to-something ratio, a growth rate, a margin —
            mean very little on their own. The same figure can look excellent in one industry and
            alarming in another. QScoring&apos;s job is to translate those raw figures into a single, honest
            answer to one question: <strong>relative to everything else you could own, how does
            this stock rank?</strong>
          </p>
        </section>

        {/* ─── FACTORS ─── */}
        <section id="factors">
          <h2>The five factor families</h2>
          <p>
            Decades of academic research converge on a handful of durable, largely independent
            drivers of long-run equity returns. QScoring organizes its view of every stock into
            five of them. Each is scored on its own, then folded into the composite.
          </p>
          <ul className="hiw-factors">
            {FACTORS.map((f) => (
              <li key={f.name} className="hiw-factor-card">
                <h3>{f.name}</h3>
                <p className="hiw-factor-tag">{f.tag}</p>
                <p className="hiw-factor-body">{f.body}</p>
              </li>
            ))}
          </ul>
          <p className="hiw-note">
            Each family is built from several underlying metrics, weighted and combined. The
            exact inputs and weights are part of the model — but the{" "}
            <Link href="/methodology">full methodology page</Link> documents the complete
            input-by-input breakdown for anyone who wants to audit it.
          </p>
        </section>

        {/* ─── PROCESS + ANIMATION ─── */}
        <section id="process">
          <h2>From a raw metric to a ranked score</h2>
          <p>
            The core technique is <strong>cross-sectional normalization</strong>. Rather than
            judging a metric against a fixed rule of thumb, QScoring compares it against the same
            metric for every other stock in the universe, then expresses the result as a relative
            position — a rank. That single move is what makes scores comparable across very
            different companies.
          </p>

          <CrossSectionalRank />

          <ol className="numbered-list hiw-steps">
            <li>
              <strong>Normalize.</strong> Each raw metric is measured against the distribution of
              that same metric across the universe, so &ldquo;good&rdquo; is defined by the peer
              group, not by a hardcoded threshold.
            </li>
            <li>
              <strong>Rank.</strong> The normalized value becomes a relative position — think
              percentiles — describing where the stock sits among everything else.
            </li>
            <li>
              <strong>Combine.</strong> The five factor views are brought together into one
              composite QScore on a 1–100 scale, alongside a directional signal and a confidence
              rating that reflects how complete the data is.
            </li>
          </ol>
        </section>

        {/* ─── COMPOSITE ─── */}
        <section id="composite">
          <h2>Why a composite beats any single number</h2>
          <p>
            Any one metric can be gamed, distorted, or simply misleading in context. A
            cheap-looking valuation can signal a bargain or a value trap. A strong recent run can
            mean a healthy trend or a bubble about to pop. Rich profitability can mask a business
            that isn&apos;t growing.
          </p>
          <p>
            Combining largely independent factors is a deliberate hedge against being fooled by
            any one of them. When a stock scores well across value, profitability, and risk at the
            same time, that agreement carries more information than any single ratio could. Where
            the factors <em>disagree</em>, the breakdown shows you exactly where the tension is —
            which is often more useful than the headline number itself.
          </p>
        </section>

        {/* ─── GROUNDING ─── */}
        <section id="grounding">
          <h2>The academic grounding</h2>
          <p>
            QScoring doesn&apos;t invent factors — it stands on a large, public body of research
            into the cross-section of equity returns. Value and the broader factor framework trace
            to the foundational asset-pricing literature; momentum, profitability, and
            low-volatility effects are each supported by widely-cited, peer-reviewed studies
            spanning the last several decades.
          </p>
          <p>
            We keep the machinery deliberately disciplined. The fewer free parameters a model has,
            the better its chance of holding up out-of-sample rather than fitting the past. That
            principle — favor robustness over cleverness — shapes every modeling choice, and it is
            why the approach leans on transparent normalization and ranking rather than opaque,
            heavily-tuned formulas.
          </p>
        </section>

        {/* ─── TRUST / PLEDGE ─── */}
        <section id="trust">
          <h2>Why you can trust it before the track record exists</h2>
          <p>
            We&apos;re new, and an honest performance record takes time to accumulate. Rather than
            ask you to take our word for it, we&apos;ve made two commitments you can hold us to:
          </p>
          <div className="pledge-box">
            <p className="pledge-headline">We won&apos;t charge until the backtest is public.</p>
            <p>
              Subscription billing stays off until our{" "}
              <Link href="/methodology#validation">validation section</Link> publishes real
              numbers — information coefficients against forward returns, quintile-spread
              performance, drawdowns versus a benchmark, and explicit bias caveats. Until then,
              treat the QScore as a transparent synthesis of established factor research, not a
              proven strategy.
            </p>
            <p className="pledge-commitment">
              <strong>And the record is being built in the open.</strong>
            </p>
            <p>
              The <Link href="/performance">live performance page</Link> commits a locked-in,
              date-stamped snapshot of every score and price we compute to public source control —
              no quiet revisions, no hindsight. Those snapshots are what the eventual backtest will
              be measured against.
            </p>
          </div>
          <p className="hiw-note">
            Want the unabridged version? The{" "}
            <Link href="/methodology">methodology page</Link> documents every input, weight, and
            decision rule that feeds a QScore — we don&apos;t think it&apos;s reasonable to charge
            for a score we won&apos;t fully explain.
          </p>
        </section>

        {/* ─── CTA ─── */}
        <section className="hiw-cta" aria-label="Try it">
          <h2>See it on a real stock</h2>
          <p>
            The fastest way to understand the QScore is to read one. Pull up any ticker and see the
            composite, the five-factor breakdown, the signal, and the confidence rating — live.
          </p>
          <div className="hiw-cta-actions">
            <Link href="/score" className="hiw-cta-primary">
              Score a ticker →
            </Link>
            <Link href="/scores" className="hiw-cta-secondary">
              Browse the universe
            </Link>
          </div>
        </section>

        <p className="hiw-disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It is not investment advice, a recommendation, or a solicitation to buy or sell any
          security. Past performance and quantitative scores do not guarantee future results.
        </p>

        <p className="back-to-top">
          <Link href="/score">← Back to scoring</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <a href="/methodology">Methodology</a>
          <span className="sep">·</span>
          <a href="/glossary">Glossary</a>
          <span className="sep">·</span>
          <a href="/scores">Categories</a>
          <span className="sep">·</span>
          <a href="/score">Score a ticker</a>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
