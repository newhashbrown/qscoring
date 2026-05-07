import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";

export const metadata = {
  title: "Methodology — How the QScore Is Calculated",
  description:
    "Full transparency on the QScore methodology: factor categories, scoring thresholds, weights, signal logic, data sources, limitations, and validation status.",
};

const TOC = [
  { id: "summary", label: "1. The QScore in 30 seconds" },
  { id: "factors", label: "2. The five factor categories" },
  { id: "combining", label: "3. How factors combine into a composite" },
  { id: "signals", label: "4. Signal generation" },
  { id: "confidence", label: "5. Confidence" },
  { id: "data", label: "6. Data sources and freshness" },
  { id: "limitations", label: "7. Known limitations" },
  { id: "validation", label: "8. Validation status" },
  { id: "disclaimers", label: "9. Disclaimers" },
];

function ThresholdTable({
  caption,
  rows,
  rawHeader = "Input",
}: {
  caption: string;
  rawHeader?: string;
  rows: Array<{ raw: string; score: number }>;
}) {
  return (
    <table className="method-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>{rawHeader}</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.raw}>
            <td>{r.raw}</td>
            <td className="score-cell">{r.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MethodologyPage() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology">
        <header className="method-header">
          <p className="method-eyebrow">Methodology</p>
          <h1>How the QScore is calculated</h1>
          <p className="method-lede">
            We don&apos;t think it&apos;s reasonable to charge for a stock score that we won&apos;t fully
            explain. Every input, threshold, weight, and decision rule that feeds the QScore is
            documented below — along with what it can&apos;t do yet, and our commitment not to start
            collecting subscriptions until we&apos;ve published a real backtest.
          </p>
        </header>

        <nav className="method-toc" aria-label="Table of contents">
          <p className="toc-label">On this page</p>
          <ol>
            {TOC.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ─── 1. SUMMARY ─── */}
        <section id="summary">
          <h2>1. The QScore in 30 seconds</h2>
          <table className="method-table summary-table">
            <tbody>
              <tr>
                <th>Output</th>
                <td>A single 1–100 score plus a directional signal and a confidence rating.</td>
              </tr>
              <tr>
                <th>Factor categories</th>
                <td>Value · Growth · Momentum · Profitability · Risk</td>
              </tr>
              <tr>
                <th>Two horizons</th>
                <td>
                  A long-term composite (weighted toward fundamentals) and a short-term composite
                  (weighted toward momentum). The headline QScore is the average of the two.
                </td>
              </tr>
              <tr>
                <th>Signal</th>
                <td>One of <strong>Buy Long-Term</strong>, <strong>Buy Short-Term</strong>, <strong>Hold</strong>, or <strong>Short</strong>.</td>
              </tr>
              <tr>
                <th>Confidence</th>
                <td>High / Medium / Low — driven by data completeness and how decisive the score is.</td>
              </tr>
              <tr>
                <th>Refresh cadence</th>
                <td>Cached for 15 minutes per ticker. Fundamentals update with quarterly filings (typically 40–60 day lag).</td>
              </tr>
              <tr>
                <th>Universe</th>
                <td>US-listed equities. Coverage gaps exist on the data plan we&apos;re currently using — see <a href="#limitations">limitations</a>.</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ─── 2. FACTORS ─── */}
        <section id="factors">
          <h2>2. The five factor categories</h2>
          <p>
            Each category is built from several underlying metrics. Every metric is mapped to a
            0–100 score using a piecewise linear function with the thresholds shown below. Within a
            category, metric scores are averaged with light weighting (2:1 at most). Missing metrics
            are dropped from the average rather than penalized — this avoids punishing companies
            that don&apos;t have meaningful book value, for example, but it also feeds into our
            <a href="#confidence"> confidence rating</a>.
          </p>

          <h3 id="factor-value">Value (lower multiples → higher score)</h3>
          <p>
            What the market is willing to pay for the company per dollar of earnings, book value,
            sales, and EBITDA. Roots in Graham &amp; Dodd&apos;s <em>Security Analysis</em> (1934) and
            formalized as the HML factor in Fama–French (1993). The premise: cheap stocks tend to
            outperform expensive stocks over long horizons, on average.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> P/E (TTM), P/B, P/S, EV/EBITDA
          </p>
          <div className="threshold-grid">
            <ThresholdTable
              caption="P/E (TTM)"
              rawHeader="P/E"
              rows={[
                { raw: "≤ 5", score: 100 },
                { raw: "12", score: 85 },
                { raw: "20", score: 60 },
                { raw: "30", score: 35 },
                { raw: "50", score: 15 },
                { raw: "≥ 100", score: 0 },
              ]}
            />
            <ThresholdTable
              caption="P/B"
              rawHeader="P/B"
              rows={[
                { raw: "≤ 0.5", score: 100 },
                { raw: "1.5", score: 80 },
                { raw: "3", score: 55 },
                { raw: "6", score: 30 },
                { raw: "12", score: 10 },
                { raw: "≥ 30", score: 0 },
              ]}
            />
            <ThresholdTable
              caption="P/S"
              rawHeader="P/S"
              rows={[
                { raw: "≤ 0.5", score: 100 },
                { raw: "2", score: 80 },
                { raw: "5", score: 55 },
                { raw: "10", score: 30 },
                { raw: "20", score: 10 },
                { raw: "≥ 40", score: 0 },
              ]}
            />
            <ThresholdTable
              caption="EV/EBITDA"
              rawHeader="EV/EBITDA"
              rows={[
                { raw: "≤ 5", score: 100 },
                { raw: "10", score: 80 },
                { raw: "15", score: 55 },
                { raw: "25", score: 30 },
                { raw: "40", score: 10 },
                { raw: "≥ 80", score: 0 },
              ]}
            />
          </div>
          <p className="caveat">
            <strong>Known weakness:</strong> P/B becomes meaningless for companies that have bought
            back enough stock to drive book value near zero (Apple&apos;s P/B is currently ~40). The
            other three value metrics partially offset this, but a sector-relative adjustment would
            do better.
          </p>

          <h3 id="factor-growth">Growth (higher growth → higher score)</h3>
          <p>
            How quickly the business is getting bigger and more profitable on a per-share basis.
            Year-over-year growth in revenue, EPS, and free cash flow as of the most recent annual
            filing.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> Revenue growth (YoY), EPS growth (YoY), Free cash flow growth
            (YoY)
          </p>
          <div className="threshold-grid">
            <ThresholdTable
              caption="Revenue growth"
              rawHeader="YoY growth"
              rows={[
                { raw: "≤ −30%", score: 0 },
                { raw: "−5%", score: 25 },
                { raw: "0%", score: 40 },
                { raw: "8%", score: 60 },
                { raw: "20%", score: 80 },
                { raw: "40%", score: 95 },
                { raw: "≥ 70%", score: 100 },
              ]}
            />
            <ThresholdTable
              caption="EPS growth"
              rawHeader="YoY growth"
              rows={[
                { raw: "≤ −50%", score: 0 },
                { raw: "−10%", score: 20 },
                { raw: "0%", score: 40 },
                { raw: "10%", score: 60 },
                { raw: "25%", score: 80 },
                { raw: "50%", score: 95 },
                { raw: "≥ 100%", score: 100 },
              ]}
            />
          </div>
          <p className="caveat">
            <strong>Known weakness:</strong> annual figures lag intra-year reality by up to 12
            months. Quarterly fundamentals would be more responsive but introduce more noise.
          </p>

          <h3 id="factor-momentum">Momentum (positive trend → higher score)</h3>
          <p>
            Price-based signals capturing how the market has been valuing the stock recently.
            Origin: Jegadeesh &amp; Titman (1993), formalized as the WML factor in Carhart&apos;s
            four-factor model (1997). The premise: stocks that have outperformed recently tend to
            keep outperforming over 3–12 month horizons.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> 12-month total return, 3-month return, 1-month return, RSI(14),
            50-day vs 200-day moving-average position
          </p>
          <div className="threshold-grid">
            <ThresholdTable
              caption="12-month return"
              rawHeader="Return"
              rows={[
                { raw: "≤ −50%", score: 0 },
                { raw: "−20%", score: 25 },
                { raw: "0%", score: 50 },
                { raw: "+20%", score: 75 },
                { raw: "+50%", score: 95 },
                { raw: "≥ +100%", score: 100 },
              ]}
            />
            <ThresholdTable
              caption="RSI(14)"
              rawHeader="RSI"
              rows={[
                { raw: "< 30 (oversold)", score: 60 },
                { raw: "50 (neutral)", score: 50 },
                { raw: "70 (healthy)", score: 88 },
                { raw: "80 (overbought)", score: 70 },
                { raw: "100 (extreme)", score: 20 },
              ]}
            />
          </div>
          <p className="caveat">
            <strong>Known weakness:</strong> momentum factors fail at regime turns. A stock crashing
            from a high RSI looks &ldquo;healthy&rdquo; right up until the moment it doesn&apos;t. The RSI
            curve is shaped to penalize extreme overbought readings, but it can&apos;t catch sudden
            reversals.
          </p>

          <h3 id="factor-profitability">Profitability (higher returns on capital → higher score)</h3>
          <p>
            How efficiently the business converts capital into profit and cash. Origin: Fama–French
            five-factor model (2015), specifically the RMW (Robust Minus Weak) factor.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> Return on equity (TTM), Return on assets (TTM), Gross margin,
            Operating margin, Net margin, Free cash flow yield
          </p>
          <div className="threshold-grid">
            <ThresholdTable
              caption="ROE (TTM)"
              rawHeader="ROE"
              rows={[
                { raw: "≤ −20%", score: 0 },
                { raw: "0%", score: 20 },
                { raw: "5%", score: 35 },
                { raw: "10%", score: 55 },
                { raw: "18%", score: 80 },
                { raw: "≥ 30%", score: 100 },
              ]}
            />
            <ThresholdTable
              caption="Margin (any)"
              rawHeader="Margin"
              rows={[
                { raw: "≤ −10%", score: 0 },
                { raw: "0%", score: 25 },
                { raw: "5%", score: 40 },
                { raw: "15%", score: 65 },
                { raw: "30%", score: 90 },
                { raw: "≥ 50%", score: 100 },
              ]}
            />
            <ThresholdTable
              caption="FCF Yield"
              rawHeader="Yield"
              rows={[
                { raw: "≤ −5%", score: 0 },
                { raw: "0%", score: 30 },
                { raw: "3%", score: 55 },
                { raw: "6%", score: 75 },
                { raw: "10%", score: 90 },
                { raw: "≥ 15%", score: 100 },
              ]}
            />
          </div>
          <p className="caveat">
            <strong>Known weakness:</strong> aggressive buybacks can artificially inflate ROE by
            shrinking the equity base. Apple&apos;s ROE around 147% is real but largely an
            accounting artifact. Including ROA and absolute margins partially mitigates this.
          </p>

          <h3 id="factor-risk">Risk (lower risk → higher score)</h3>
          <p>
            How much the stock moves with the market and how much it moves on its own. Origins span
            CAPM (Sharpe, 1964) and the low-volatility anomaly research from Frazzini–Pedersen and
            others.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> Beta to S&amp;P 500, 60-day annualized realized volatility
          </p>
          <div className="threshold-grid">
            <ThresholdTable
              caption="Beta (distance from 1.0)"
              rawHeader="|β − 1|"
              rows={[
                { raw: "0 (β ≈ 1.0)", score: 100 },
                { raw: "0.3", score: 85 },
                { raw: "0.6", score: 60 },
                { raw: "1.0", score: 35 },
                { raw: "≥ 2.5", score: 0 },
              ]}
            />
            <ThresholdTable
              caption="60-day annualized vol"
              rawHeader="σ"
              rows={[
                { raw: "≤ 10%", score: 100 },
                { raw: "20%", score: 85 },
                { raw: "30%", score: 65 },
                { raw: "50%", score: 35 },
                { raw: "≥ 150%", score: 0 },
              ]}
            />
          </div>
          <p className="caveat">
            <strong>Known weakness:</strong> beta is inherently backward-looking. A stock&apos;s beta
            can shift dramatically through regime changes. We use beta as reported by FMP, which is
            calculated against ~5 years of history.
          </p>
        </section>

        {/* ─── 3. COMBINING ─── */}
        <section id="combining">
          <h2>3. How factors combine into a composite</h2>
          <p>
            Once each metric is on the 0–100 scale, the math is deliberately straightforward:
          </p>
          <ol className="numbered-list">
            <li>
              <strong>Aggregate within category.</strong> Average the metric scores in a category,
              with light weighting (no metric weighs more than 1.5× another). Missing metrics are
              skipped, not zeroed.
            </li>
            <li>
              <strong>Compute two composite scores</strong> using two different sets of weights,
              one for each horizon:
            </li>
          </ol>
          <table className="method-table weight-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Long-term weight</th>
                <th>Short-term weight</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Value</td><td>30%</td><td>10%</td></tr>
              <tr><td>Growth</td><td>20%</td><td>15%</td></tr>
              <tr><td>Profitability</td><td>25%</td><td>10%</td></tr>
              <tr><td>Momentum</td><td>5%</td><td>40%</td></tr>
              <tr><td>Risk</td><td>20%</td><td>25%</td></tr>
            </tbody>
          </table>
          <p>
            The headline <strong>composite QScore</strong> is the simple average of the long-term
            and short-term scores. We chose flat averaging deliberately: any user-customizable
            blend would be a separate product feature, not a default.
          </p>
          <p className="caveat">
            <strong>Why piecewise mapping instead of z-scores against a population?</strong>{" "}
            Z-score normalization is the correct quantitative answer once you have a stable
            universe of scored stocks. We&apos;re using piecewise heuristic thresholds in the MVP
            because they let us score a single ticker in isolation without first computing scores
            for every other US stock. Once we have a complete universe and a backtest, we&apos;ll
            switch to sector-relative z-scores and republish this page.
          </p>
        </section>

        {/* ─── 4. SIGNALS ─── */}
        <section id="signals">
          <h2>4. Signal generation</h2>
          <p>
            The directional signal is derived from the long-term and short-term scores using these
            rules, evaluated in order:
          </p>
          <table className="method-table">
            <thead>
              <tr>
                <th>If…</th>
                <th>Then signal is</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Long-term score &lt; 30 <em>or</em> short-term score &lt; 30</td>
                <td><strong>Short</strong></td>
              </tr>
              <tr>
                <td>Short-term ≥ 65 <em>and</em> momentum category ≥ 60</td>
                <td><strong>Buy Short-Term</strong></td>
              </tr>
              <tr>
                <td>Long-term ≥ 70</td>
                <td><strong>Buy Long-Term</strong></td>
              </tr>
              <tr>
                <td>Long-term ≥ 60 and long-term &gt; short-term</td>
                <td><strong>Buy Long-Term</strong></td>
              </tr>
              <tr>
                <td>Short-term ≥ 60 and short-term &gt; long-term</td>
                <td><strong>Buy Short-Term</strong></td>
              </tr>
              <tr>
                <td>Otherwise</td>
                <td><strong>Hold</strong></td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ─── 5. CONFIDENCE ─── */}
        <section id="confidence">
          <h2>5. Confidence</h2>
          <p>
            Confidence reflects two things: how complete the underlying data is, and how decisive
            the resulting score is. A composite score of 50 with 40% missing data is genuinely less
            useful than a composite of 78 computed on complete data, and we say so.
          </p>
          <table className="method-table">
            <thead>
              <tr>
                <th>Confidence</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>High</strong></td><td>Average data completeness ≥ 85% AND composite ≥ 70 or ≤ 30</td></tr>
              <tr><td><strong>Medium</strong></td><td>Average data completeness ≥ 75% but the score lands in the indecisive 30–70 range</td></tr>
              <tr><td><strong>Low</strong></td><td>Average data completeness &lt; 60%, or insufficient data to evaluate any one category</td></tr>
            </tbody>
          </table>
        </section>

        {/* ─── 6. DATA ─── */}
        <section id="data">
          <h2>6. Data sources and freshness</h2>
          <p>
            We use{" "}
            <a href="https://site.financialmodelingprep.com" target="_blank" rel="noopener noreferrer">
              Financial Modeling Prep
            </a>{" "}
            for everything price- and fundamentals-related: company profile, real-time quote,
            trailing-twelve-month ratios and key metrics, year-over-year growth, and 5 years of
            end-of-day price history. Their <code>/stable/*</code> API is the source of truth for
            every number that feeds a QScore.
          </p>
          <p>
            The natural-language analysis paragraph below each score is generated by{" "}
            <a href="https://developers.cloudflare.com/workers-ai/" target="_blank" rel="noopener noreferrer">
              Cloudflare Workers AI
            </a>{" "}
            running Llama 3.3 70B (Instruct, FP8). The model receives the structured QScore output —
            composite, signals, all category scores, all underlying raw metrics — and produces a
            60–100 word paragraph explaining what&apos;s driving the score. It does not have access
            to news, analyst opinions, or any data outside the structured score.
          </p>
          <table className="method-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Refreshes every</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Score page (CDN cache)</td><td>15 minutes</td></tr>
              <tr><td>Underlying FMP data fetches</td><td>15 minutes (cache TTL)</td></tr>
              <tr><td>End-of-day prices</td><td>Updated by FMP after US market close</td></tr>
              <tr><td>TTM ratios &amp; key metrics</td><td>Updated by FMP after each quarterly filing (typically 40–60 day lag)</td></tr>
              <tr><td>AI commentary</td><td>Regenerated whenever the score changes</td></tr>
            </tbody>
          </table>
        </section>

        {/* ─── 7. LIMITATIONS ─── */}
        <section id="limitations">
          <h2>7. Known limitations</h2>
          <p>
            Things we&apos;d rather you read here than discover the hard way:
          </p>
          <ul className="caveat-list">
            <li>
              <strong>Universe coverage is incomplete.</strong> Our current FMP plan covers most
              S&amp;P 500 and large/mid-cap names cleanly. Smaller-cap tickers, ADRs, and tickers
              with exchange suffixes (BRK.B, BF.B) frequently return &ldquo;not in your data
              plan&rdquo; errors. Upgrading our data plan fixes this.
            </li>
            <li>
              <strong>No sector-relative adjustment yet.</strong> Tech mega-caps trade at
              structurally higher multiples than industrials, but the current Value scoring is
              absolute. Apple looks &ldquo;expensive&rdquo; on P/B because it almost has to. A
              future revision will normalize each metric within its sector.
            </li>
            <li>
              <strong>Trailing data lags reality.</strong> TTM fundamentals reflect the 12 months
              ending at the most recent reported quarter, which is itself filed 30–60 days after
              the quarter closes. A fast-moving turnaround story can score below where it deserves.
            </li>
            <li>
              <strong>Backtest not yet published.</strong> Until the{" "}
              <a href="#validation">validation section</a> contains real numbers, treat the QScore
              as an opinionated synthesis of well-known factor research, not as a strategy with
              demonstrated risk-adjusted return.
            </li>
            <li>
              <strong>The score is not personalized.</strong> No tax considerations, no portfolio
              correlation, no risk profile. The same QScore is shown to everyone.
            </li>
            <li>
              <strong>Score volatility on rebalance days.</strong> When a quarterly filing lands or
              an unusual price move resets the momentum window, scores can shift several points in
              a single day. This is expected behavior, not a bug, but it can be confusing.
            </li>
            <li>
              <strong>Signal labels are not advice.</strong> &ldquo;Buy Long-Term&rdquo; means the
              factor model thinks the stock looks attractive over a 6–12 month horizon. It is not a
              recommendation to buy. See <a href="#disclaimers">disclaimers</a>.
            </li>
            <li>
              <strong>Survivorship bias in any future backtest.</strong> Historical data we have
              access to includes only currently-listed companies. Stocks that went to zero are
              missing from the dataset, which generally inflates backtested factor performance.
              We will disclose this caveat alongside any reported backtest figures.
            </li>
            <li>
              <strong>The model is deterministic, not adaptive.</strong> The scoring weights are
              fixed and don&apos;t change in response to market regime. This is a feature for
              transparency and a limitation for performance.
            </li>
          </ul>
        </section>

        {/* ─── 8. VALIDATION ─── */}
        <section id="validation">
          <h2>8. Validation status</h2>
          <div className="pledge-box">
            <p className="pledge-headline">Backtest in progress.</p>
            <p>
              We have not yet published backtested information-coefficient (IC) values, quintile
              spread returns, or risk-adjusted performance metrics for the QScore. Until we do, this
              page is a description of methodology, not a claim of risk-adjusted returns.
            </p>
            <p className="pledge-commitment">
              <strong>We will not turn on subscription billing until this section contains:</strong>
            </p>
            <ul>
              <li>Information coefficient (Spearman rank correlation between QScore and forward returns) for 1-month, 3-month, 6-month, and 12-month horizons</li>
              <li>Long-short quintile-spread return time series with annualized return, volatility, and Sharpe</li>
              <li>Drawdown profile of the top quintile vs SPY benchmark</li>
              <li>Rolling-window IC analysis to show factor stability over time</li>
              <li>An explicit list of survivorship-bias and look-ahead-bias caveats applied to the backtest</li>
            </ul>
            <p>
              Once published, those numbers will replace this box. Until then, treat the QScore as
              a transparent synthesis of well-established factor research — useful as a structured
              second opinion, but not validated as a standalone investment strategy.
            </p>
          </div>
        </section>

        {/* ─── 9. DISCLAIMERS ─── */}
        <section id="disclaimers">
          <h2>9. Disclaimers</h2>
          <p>
            QScoring provides quantitative analysis for informational and educational purposes
            only. It does not constitute investment advice, a recommendation, or a solicitation to
            buy or sell any security. Past performance and quantitative scores do not guarantee
            future results. Always conduct your own research and consult a licensed financial
            advisor before making investment decisions. Nothing on this site establishes a
            fiduciary or advisory relationship.
          </p>
        </section>

        <p className="back-to-top">
          <Link href="/score">← Back to scoring</Link>
        </p>
      </main>

      <footer>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
