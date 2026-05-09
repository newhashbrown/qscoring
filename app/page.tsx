import { Suspense } from "react";
import DemoCard from "./components/DemoCard";
import EmailForm from "./components/EmailForm";
import TopMoversStrip from "./components/TopMoversStrip";

// Refresh the live NVDA demo score at most once per hour.
export const revalidate = 3600;

export default function Home() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <nav className="landing-nav">
        <div className="logo">
          QScoring<span>.com</span>
        </div>
        <div className="nav-actions">
          <a href="/score" className="nav-link">
            Try a Score
          </a>
          <a href="#signup" className="nav-cta">
            Get Early Access
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-badge">
          <span className="dot" /> Launching Summer 2026
        </div>
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
        <EmailForm buttonLabel="Get Early Access" />
        <p className="form-note">Free early access. No credit card required.</p>
      </section>

      {/* DEMO SCORE CARD — live from FMP */}
      <section className="demo-section">
        <DemoCard />
      </section>

      {/* TOP MOVERS — biggest 24-hour QScore swings */}
      <Suspense fallback={null}>
        <TopMoversStrip />
      </Suspense>

      {/* FEATURES */}
      <section className="features">
        <h2>What you get with QScoring</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon green">📊</div>
            <h3>Composite Quant Score</h3>
            <p>
              Five factor categories — value, growth, momentum, profitability, and risk —
              distilled into a single 1–100 score for any US stock.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon amber">🎯</div>
            <h3>Directional Signals</h3>
            <p>
              Buy Short-Term, Buy Long-Term, Hold, or Short. Clear guidance calibrated to your
              time horizon, not a wall of charts.
            </p>
          </div>
          <a href="/methodology" className="feature-card">
            <div className="feature-icon green">🔍</div>
            <h3>Transparent Methodology</h3>
            <p>See exactly which factors drive the score. Every threshold, weight, and rule is documented. No black boxes.</p>
          </a>
          <div className="feature-card">
            <div className="feature-icon amber">🔔</div>
            <h3>Watchlist & Alerts</h3>
            <p>
              Track the stocks you care about. Get notified when scores shift or signals change so
              you never miss a move.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon green">⚡</div>
            <h3>Instant Results</h3>
            <p>
              No accounts to set up, no dashboards to configure. Type a ticker, get your score.
              Analysis in seconds, not hours.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon red">🚫</div>
            <h3>Zero Ads. Zero Noise.</h3>
            <p>
              Subscription-powered means we work for you, not advertisers. Clean interface, no
              upsells, no sponsored content.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
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
      <section className="cta-bottom" id="signup">
        <h2>Be first in line.</h2>
        <p>Join the waitlist and get free early access when we launch.</p>
        <EmailForm
          buttonLabel="Join Waitlist"
          style={{ margin: "0 auto", animation: "none" }}
        />
      </section>

      {/* FOOTER */}
      <footer>
        <p className="footer-links">
          <a href="/methodology">Methodology</a>
          <span className="sep">·</span>
          <a href="/glossary">Glossary</a>
          <span className="sep">·</span>
          <a href="/scores">Categories</a>
          <span className="sep">·</span>
          <a href="/compare">Compare</a>
          <span className="sep">·</span>
          <a href="/score">Score a ticker</a>
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
