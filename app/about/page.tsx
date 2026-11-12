import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";

export const metadata = {
  title: "About QScoring — Quantitative Stock Scoring",
  description:
    "QScoring is an independent quantitative stock-scoring tool. Learn what the QScore is, the five factors behind it, and how it produces a clear buy, hold, or short signal for any US-listed stock.",
  alternates: { canonical: "https://qscoring.com/about" },
  openGraph: {
    title: "About QScoring — Quantitative Stock Scoring",
    description:
      "What the QScore is, the five factors behind it, and how it produces a clear buy, hold, or short signal for any US-listed stock.",
    url: "https://qscoring.com/about",
    siteName: "QScoring",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function AboutPage() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav showSearch={false} />

      <main className="methodology">
        <header className="method-header">
          <p className="method-eyebrow">About</p>
          <h1>About QScoring</h1>
          <p className="method-lede">
            <strong>QScoring</strong> is an independent, quantitative stock-scoring tool. Enter any
            US-listed ticker and QScoring returns a single 0–100 <strong>QScore</strong> and a clear
            buy, hold, or short signal — distilled from the same factors professional quants weigh,
            without the noise.
          </p>
        </header>

        <section>
          <h2>What QScoring does</h2>
          <p>
            QScoring scores every stock across five factor categories — value, growth, momentum,
            profitability, and risk — and combines them into one composite QScore. Instead of a wall
            of charts and ratios, you get a number, a signal, and a transparent breakdown of why.
          </p>
        </section>

        <section>
          <h2>How the QScore works</h2>
          <p>
            Each factor is normalized against the scored universe of US equities, weighted, and
            combined into the composite. The full weighting and signal logic is documented on the{" "}
            <Link href="/methodology">methodology</Link> page, and every term is defined in the{" "}
            <Link href="/glossary">glossary</Link>. You can{" "}
            <Link href="/score">score any ticker</Link> or browse the{" "}
            <Link href="/scores">category leaderboards</Link>.
          </p>
        </section>

        <section>
          <h2>Independent by design</h2>
          <p>
            QScoring is subscription-supported, not ad-supported — there are no sponsored rankings
            and no upsells distorting the scores. The model works for the reader, not advertisers.
          </p>
        </section>

        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice, a recommendation, or a solicitation to buy or
          sell any security. Always conduct your own research and consult a licensed financial
          advisor before making investment decisions.
        </p>
      </main>

      <footer>
        <nav aria-label="Footer">
          <p className="footer-links">
            <Link href="/">QScoring</Link>
            <span className="sep" aria-hidden="true">·</span>
            <Link href="/methodology">Methodology</Link>
            <span className="sep" aria-hidden="true">·</span>
            <Link href="/score">Score a ticker</Link>
          </p>
        </nav>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
