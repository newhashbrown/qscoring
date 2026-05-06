import EmailForm from "./components/EmailForm";

type FactorRowProps = {
  label: string;
  value: number;
  width: string;
  color: "green" | "amber" | "red";
  delay: string;
};

function FactorRow({ label, value, width, color, delay }: FactorRowProps) {
  return (
    <div className="factor">
      <span className="factor-label">{label}</span>
      <div className="factor-track">
        <div
          className={`factor-fill ${color}`}
          style={{ ["--w" as string]: width, ["--delay" as string]: delay } as React.CSSProperties}
        />
      </div>
      <span className="factor-val">{value}</span>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <nav>
        <div className="logo">
          QScoring<span>.com</span>
        </div>
        <a href="#signup" className="nav-cta">
          Get Early Access
        </a>
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
          Enter any stock ticker and get an instant Quant Score powered by fundamentals,
          momentum, and sentiment — with a clear buy, hold, or short signal.
        </p>
        <EmailForm buttonLabel="Get Early Access" />
        <p className="form-note">Free early access. No credit card required.</p>
      </section>

      {/* DEMO SCORE CARD */}
      <section className="demo-section">
        <div className="demo-card">
          <div className="demo-header">
            <div className="demo-ticker">
              NVDA <span className="company">NVIDIA Corporation</span>
            </div>
            <div className="demo-price">
              $135.40 <span className="change">+2.3%</span>
            </div>
          </div>
          <div className="score-ring">
            <div className="ring-container">
              <svg viewBox="0 0 100 100" width="100" height="100">
                <circle className="ring-bg" cx="50" cy="50" r="45" />
                <circle className="ring-fill" cx="50" cy="50" r="45" />
              </svg>
              <div className="ring-number">79</div>
            </div>
            <div className="score-meta">
              <h3>QScore Signal</h3>
              <div className="signal">▲ Buy Long-Term</div>
              <div className="confidence">Confidence: High</div>
            </div>
          </div>
          <div className="factor-bars">
            <FactorRow label="Value" value={62} width="62%" color="green" delay="0.9s" />
            <FactorRow label="Growth" value={91} width="91%" color="green" delay="1s" />
            <FactorRow label="Momentum" value={84} width="84%" color="green" delay="1.1s" />
            <FactorRow label="Profitability" value={88} width="88%" color="green" delay="1.2s" />
            <FactorRow label="Risk" value={55} width="55%" color="amber" delay="1.3s" />
          </div>
        </div>
      </section>

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
          <div className="feature-card">
            <div className="feature-icon green">🔍</div>
            <h3>Transparent Methodology</h3>
            <p>See exactly which factors drive the score. No black boxes. No hidden agendas. Just data.</p>
          </div>
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
              Our model analyzes fundamentals, technicals, and sentiment to generate a composite
              score from 1 to 100.
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
