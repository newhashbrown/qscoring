import { Suspense } from "react";
import DemoCard from "./components/DemoCard";
import EmailForm from "./components/EmailForm";
import ScoreNav from "./components/ScoreNav";
import ScoreRing from "./components/ScoreRing";
import TickerSearch from "./components/TickerSearch";
import TopMoversStrip, { TopMoversStripSkeleton } from "./components/TopMoversStrip";

const FACTOR_SAMPLES = [
  { label: "Value", score: 72 },
  { label: "Growth", score: 85 },
  { label: "Momentum", score: 66 },
  { label: "Profitability", score: 91 },
  { label: "Risk", score: 38 },
] as const;

// Refresh the live NVDA demo score at most once per hour.
export const revalidate = 3600;

export default function Home() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav showSearch={false} />

      {/* HERO */}
      <section className="hero">
        <h1>
          One ticker.
          <br />
          One <span className="accent">score</span>.<br />
          One clear signal.
        </h1>
        <p className="sub">
          Enter any stock ticker and get an instant Quant Score powered by value, growth,
          momentum, profitability, and risk factors — with a clear buy, hold, or short signal.
        </p>
        <TickerSearch size="full" />
      </section>

      {/* DEMO SCORE CARD — live from FMP */}
      <section className="demo-section">
        <DemoCard />
      </section>

      {/* TOP MOVERS — biggest 24-hour QScore swings */}
      <div className="section-divider" />
      <Suspense fallback={<TopMoversStripSkeleton />}>
        <TopMoversStrip />
      </Suspense>

      {/* FEATURES */}
      <section className="features">
        <h2>Five factors. One clear signal.</h2>
        <p className="features-sub">
          Value, growth, momentum, profitability, and risk — synthesized into a single composite
          score so you get signal, not noise.
        </p>

        <div className="features-showcase">
          {/* Composite card */}
          <div className="showcase-composite">
            <div className="showcase-eyebrow">Composite QScore</div>
            <ScoreRing value={74} size={112} animate />
            <div className="showcase-signal">Buy Long-Term</div>
            <div className="showcase-horizons">
              <span>Long-Term <strong>78</strong></span>
              <span>Short-Term <strong>71</strong></span>
            </div>
            <p className="showcase-note">Illustrative sample</p>
          </div>

          {/* Factor chips */}
          <div className="showcase-factors">
            {FACTOR_SAMPLES.map(({ label, score }) => (
              <div key={label} className="factor-chip">
                <ScoreRing value={score} size={56} animate />
                <span className="factor-chip-label">{label}</span>
              </div>
            ))}
            <a href="/methodology" className="factor-chip factor-chip-cta">
              <span className="factor-chip-cta-text">Full methodology →</span>
            </a>
          </div>
        </div>

        {/* Secondary: non-visual features */}
        <div className="features-secondary">
          <div className="feature-sec">
            <div className="feature-sec-icon" aria-hidden="true">
              {/* Trending-up arrow — directional signal */}
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2,14 7,9 11,12 18,5" />
                <polyline points="13,5 18,5 18,10" />
              </svg>
            </div>
            <h3>Directional signals</h3>
            <p>
              Buy Short-Term, Buy Long-Term, Hold, or Short — calibrated to your time horizon,
              not a wall of charts.
            </p>
          </div>
          <div className="feature-sec">
            <div className="feature-sec-icon" aria-hidden="true">
              {/* Zap / bolt — instant results */}
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13,2 4,11 10,11 7,18 16,9 10,9" />
              </svg>
            </div>
            <h3>Instant results</h3>
            <p>
              No setup. No dashboard. Type a ticker and get your score in seconds.
            </p>
          </div>
          <div className="feature-sec">
            <div className="feature-sec-icon" aria-hidden="true">
              {/* Shield-check — no ads, subscriber protected */}
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2L3.5 5v5c0 3.5 2.8 6.8 6.5 7.9 3.7-1.1 6.5-4.4 6.5-7.9V5L10 2z" />
                <polyline points="7.5,10 9.5,12 13,8" />
              </svg>
            </div>
            <h3>Zero ads. Zero noise.</h3>
            <p>
              Subscription-powered. We work for you, not advertisers — clean interface, no
              upsells, no sponsored content.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <div className="section-divider" />
      <section className="how-it-works">
        <h2>How it works</h2>
        <div className="step">
          <div className="step-num">1</div>
          <div>
            <h3>Enter any ticker</h3>
            <p>Type in a stock symbol — AAPL, TSLA, NVDA, or any US-listed equity.</p>
          </div>
        </div>
        <div className="step">
          <div className="step-num">2</div>
          <div>
            <h3>Get your Quant Score</h3>
            <p>
              Our model analyzes fundamentals (value, growth, profitability) along with momentum
              and risk to generate a composite score from 1 to 100.
            </p>
          </div>
        </div>
        <div className="step">
          <div className="step-num">3</div>
          <div>
            <h3>See the signal</h3>
            <p>
              Buy Short-Term, Buy Long-Term, Hold, or Short — plus a confidence level and full
              factor breakdown.
            </p>
          </div>
        </div>
        <div className="step">
          <div className="step-num">4</div>
          <div>
            <h3>Make informed decisions</h3>
            <p>
              Use the score alongside your own research. Track changes over time with your
              personalized watchlist.
            </p>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <div className="section-divider" />
      <section className="cta-bottom" id="signup">
        <h2>Stay ahead of the market.</h2>
        <p>Get weekly quant score digests and new feature updates delivered to your inbox.</p>
        <EmailForm
          buttonLabel="Subscribe"
          style={{ margin: "0 auto", animation: "none" }}
        />
      </section>

      {/* FOOTER */}
      <footer>
        <nav aria-label="Footer">
          <p className="footer-links">
            <a href="/methodology">Methodology</a>
            <span className="sep" aria-hidden="true">·</span>
            <a href="/performance">Performance</a>
            <span className="sep" aria-hidden="true">·</span>
            <a href="/blog">Blog</a>
            <span className="sep" aria-hidden="true">·</span>
            <a href="/glossary">Glossary</a>
            <span className="sep" aria-hidden="true">·</span>
            <a href="/scores">Categories</a>
            <span className="sep" aria-hidden="true">·</span>
            <a href="/compare">Compare</a>
            <span className="sep" aria-hidden="true">·</span>
            <a href="/portfolio">Portfolio</a>
            <span className="sep" aria-hidden="true">·</span>
            <a href="/score">Score a ticker</a>
          </p>
        </nav>
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
