import Link from "next/link";
import ScoreNav from "../components/ScoreNav";
import TickerSearch from "../components/TickerSearch";

const POPULAR = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "BRK.B"];

export default function ScoreLandingPage() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="score-search-page">
        <h1 className="search-h1">
          Type any ticker.<br />
          Get an instant <span className="accent">Quant Score</span>.
        </h1>
        <p className="search-sub">
          We score every US-listed stock across value, growth, momentum, profitability, and risk —
          delivered as a single 1–100 number with a clear directional signal.
        </p>
        <div className="search-bar-wrap">
          <TickerSearch size="full" />
        </div>
        <div className="popular-tickers">
          <span className="popular-label">Popular</span>
          {POPULAR.map((t) => (
            <Link key={t} href={`/score/${t}`} className="popular-chip">
              {t}
            </Link>
          ))}
        </div>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/">Home</Link>
        </p>
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice, a recommendation, or a solicitation to buy or
          sell any security. Past performance and quantitative scores do not guarantee future
          results. Always conduct your own research and consult a licensed financial advisor before
          making investment decisions.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
