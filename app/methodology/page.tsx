import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import { QSCORE_MODEL_VERSION } from "@/lib/scoring";

export const metadata = {
  title: "Methodology — How the QScore Is Calculated",
  description:
    "Full transparency on the QScore methodology: factor categories, z-score normalization against the universe, weights, signal logic, data sources, limitations, and validation status.",
  alternates: { canonical: "https://qscoring.com/methodology" },
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

const methodologyJsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "QScore Methodology",
  description:
    "Full transparency on the QScore methodology: factor categories, z-score normalization against the universe, weights, signal logic, data sources, limitations, and validation status.",
  author: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
  publisher: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://qscoring.com/methodology",
  },
  proficiencyLevel: "Expert",
  about: {
    "@type": "Thing",
    name: "Quantitative stock scoring methodology",
  },
};

export default function MethodologyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(methodologyJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology">
        <header className="method-header">
          <p className="method-eyebrow">Methodology · QScore model {QSCORE_MODEL_VERSION}</p>
          <h1>How the QScore is calculated</h1>
          <p className="method-lede">
            We don&apos;t think it&apos;s reasonable to charge for a stock score that we won&apos;t fully
            explain. Every input, weight, and decision rule that feeds the QScore is documented
            below — along with what it can&apos;t do yet, and our commitment not to start collecting
            subscriptions until we&apos;ve published a real backtest.
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
                <th>Normalization</th>
                <td>
                  Each metric is z-scored against the distribution of the same metric across the
                  ticker&apos;s sector (with a fall-back to the full universe of mid+large-cap US stocks
                  when the sector has too few names).
                </td>
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
                <td>US-listed equities (NASDAQ + NYSE, market cap above $2B — mid-cap and larger), capped at 800 names per refresh. Coverage gaps exist outside this — see <a href="#limitations">limitations</a>.</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ─── 2. FACTORS ─── */}
        <section id="factors">
          <h2>2. The five factor categories</h2>
          <p>
            Each category is built from several underlying metrics. Every metric is converted to a
            0–100 score by{" "}
            <a href="#combining">z-scoring it against the ticker&apos;s sector</a>, with the
            ticker&apos;s standard deviations from the sector mean mapped linearly to a score
            (z=0 → 50, z=±3 → 100/0). Within a category, metric scores are averaged with light
            weighting (no metric weighs more than 1.5× another). Missing metrics are dropped from
            the average rather than penalized — this avoids punishing companies that don&apos;t
            have meaningful book value, for example, but it feeds into our{" "}
            <a href="#confidence">confidence rating</a>.
          </p>

          <h3 id="factor-value">Value (lower multiples → higher score)</h3>
          <p>
            What the market is willing to pay for the company per dollar of earnings, book value,
            sales, and EBITDA. Roots in Graham &amp; Dodd&apos;s <em>Security Analysis</em> (1934)
            and formalized as the HML factor in Fama–French (1993). The premise: cheap stocks tend
            to outperform expensive stocks over long horizons, on average.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> P/E (TTM), P/B, P/S, EV/EBITDA. Negative values (loss-making
            companies, distressed book values, negative EBITDA) get a fixed low score; everything
            else is z-scored against the sector with the sign inverted (lower raw value → higher
            score).
          </p>
          <p className="caveat">
            <strong>Known weakness:</strong> P/B becomes meaningless for companies that have bought
            back enough stock to drive book value near zero (Apple&apos;s P/B is currently ~40).
            Sector z-scoring partially mitigates this by comparing each tech mega-cap only to other
            tech mega-caps, but the ratio itself is fundamentally noisy in those situations.
          </p>

          <h3 id="factor-growth">Growth (higher growth → higher score)</h3>
          <p>
            How quickly the business is getting bigger and more profitable on a per-share basis.
            Year-over-year growth in revenue, EPS, and free cash flow as of the most recent annual
            filing.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> Revenue growth (YoY), EPS growth (YoY), Free cash flow growth
            (YoY). Each is z-scored against the sector — a 10% growth rate in Energy means
            something different than a 10% growth rate in Technology.
          </p>
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
            50-day vs 200-day moving-average position. Returns are z-scored against the sector;
            RSI uses a fixed non-monotonic curve (low RSI = oversold rebound potential, mid-high =
            healthy momentum, extreme high = overbought risk); the MA crossover is a binary
            golden-cross / death-cross indicator.
          </p>
          <p className="caveat">
            <strong>Known weakness:</strong> momentum factors fail at regime turns. A stock crashing
            from a high RSI looks &ldquo;healthy&rdquo; right up until the moment it doesn&apos;t.
          </p>

          <h3 id="factor-profitability">Profitability (higher returns on capital → higher score)</h3>
          <p>
            How efficiently the business converts capital into profit and cash. Origin: Fama–French
            five-factor model (2015), specifically the RMW (Robust Minus Weak) factor.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> Return on equity (TTM), Return on assets (TTM), Gross margin,
            Operating margin, Net margin, Free cash flow yield. All z-scored within sector. A 30%
            gross margin is excellent in retail and unremarkable in software, and the score reflects
            that.
          </p>
          <p className="caveat">
            <strong>Known weakness:</strong> aggressive buybacks can artificially inflate ROE by
            shrinking the equity base. Apple&apos;s ROE around 147% is real but largely an
            accounting artifact. ROA and absolute margins partially correct for this.
          </p>

          <h3 id="factor-risk">Risk (lower risk → higher score)</h3>
          <p>
            How much the stock moves with the market and how much it moves on its own. Origins span
            CAPM (Sharpe, 1964) and the low-volatility anomaly research from Frazzini–Pedersen and
            others.
          </p>
          <p className="metric-list-inline">
            <strong>Metrics:</strong> Beta to S&amp;P 500 (closer to 1.0 = higher score), 60-day
            annualized realized volatility (lower = higher score, z-scored within sector).
          </p>
          <p className="caveat">
            <strong>Known weakness:</strong> beta is inherently backward-looking. A stock&apos;s
            beta can shift dramatically through regime changes. We use beta as reported by FMP,
            which is calculated against ~5 years of history.
          </p>
        </section>

        {/* ─── 3. COMBINING ─── */}
        <section id="combining">
          <h2>3. How factors combine into a composite</h2>
          <p>
            The math is deliberately simple. Chan&apos;s rule of thumb in <em>Quantitative
            Trading</em> (2008) is to keep <em>free</em> parameters under five — where a free
            parameter is a degree of freedom <em>fitted to the data</em> (optimized on returns),
            because each one fitted is another way to overfit a backtest. The QScore has
            essentially none of those: z-score normalization fits nothing per metric, and the
            category weights below are set <em>a-priori</em> — chosen from the published factor
            literature, not tuned against historical returns — so they are not &ldquo;free
            parameters&rdquo; in Chan&apos;s sense. That is a deliberate choice to keep the model
            low-complexity and resistant to overfitting, at the cost of not squeezing every point
            of in-sample performance out of the weights.
          </p>
          <ol className="numbered-list">
            <li>
              <strong>Z-score each raw metric</strong> against the distribution of that same metric
              across the ticker&apos;s sector. If the sector has fewer than 15 covered names, fall
              back to the full universe distribution. Statistics are winsorized at the 5th and 95th
              percentile before computing mean and standard deviation, so a single outlier can&apos;t
              skew the reference distribution.
            </li>
            <li>
              <strong>Map the z-score to a 0–100 score.</strong> Linear: z=0 → 50, z=±1 → ~67/33,
              z=±2 → ~83/17, clipped at z=±3 → 100/0. For metrics where lower is better (P/E, P/B,
              volatility), the sign is inverted before mapping.
            </li>
            <li>
              <strong>Aggregate within category.</strong> Weighted average of metric scores in the
              category. Missing metrics are skipped (not zeroed) — they reduce the completeness
              factor that feeds confidence.
            </li>
            <li>
              <strong>Compute two composites</strong> using two different sets of category weights,
              one per horizon:
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
            The headline composite QScore is the simple average of the two horizon scores. Any
            user-customizable blend would be a separate product feature, not the default.
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
                <td>Long-term &lt; 30 <em>or</em> short-term &lt; 30</td>
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
            the resulting score is. A composite of 50 with 40% missing data is genuinely less
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
              <tr><td>Real-time quote (FMP)</td><td>15 minutes (matches the page-level cache)</td></tr>
              <tr><td>End-of-day price history (FMP)</td><td>6 hours (FMP only updates this once per US market close)</td></tr>
              <tr><td>Company profile, TTM ratios &amp; key metrics, growth (FMP)</td><td>24 hours (these only change on quarterly filings — caching them aggressively keeps us under FMP&apos;s rate limit during traffic spikes without affecting score freshness)</td></tr>
              <tr><td>Universe stats (sector means/stds)</td><td>Nightly cron at 02:00 UTC (post-close); commits the refreshed file to public source control if anything changed</td></tr>
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
              <strong>The reference universe is mid-cap and larger.</strong> Sector mean/std statistics
              are computed from US-listed stocks with market cap above $2B (capped at 800 names).
              A micro-cap value stock will be z-scored against mid+large-cap peers, which biases
              certain metrics. Expanding to small- and micro-cap coverage is on the roadmap once
              we can confirm FMP&apos;s data quality holds up at that tier.
            </li>
            <li>
              <strong>Scoring outside the reference universe still works,</strong> but with
              degraded precision — a micro-cap or international ADR is z-scored against the closest
              available sector mean.
            </li>
            <li>
              <strong>Trailing data lags reality.</strong> TTM fundamentals reflect the 12 months
              ending at the most recent reported quarter, which is filed 30–60 days after the
              quarter closes. A fast-moving turnaround story can score below where it deserves.
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
              a single day. This is expected behavior, not a bug.
            </li>
            <li>
              <strong>Signal labels are not advice.</strong> &ldquo;Buy Long-Term&rdquo; means the
              factor model thinks the stock looks attractive over a 6–12 month horizon. It is not a
              recommendation to buy. See <a href="#disclaimers">disclaimers</a>.
            </li>
            <li>
              <strong>Survivorship bias in any future backtest.</strong> Historical data we have
              access to includes only currently-listed companies. Stocks that went to zero are
              missing, which generally inflates backtested factor performance. We will disclose
              this caveat alongside any reported backtest figures.
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
              <li>Long-short quintile-spread return time series with annualized return, volatility, and a Sharpe ratio of at least 1.5</li>
              <li>Drawdown profile of the top quintile vs SPY benchmark</li>
              <li>Rolling-window IC analysis to show factor stability over time</li>
              <li>Look-ahead bias verification using the truncation-rerun method described in Chan (2008)</li>
              <li>An explicit list of survivorship-bias and look-ahead-bias caveats applied to the backtest</li>
            </ul>
            <p>
              Once published, those numbers will replace this box. Until then, treat the QScore as
              a transparent synthesis of well-established factor research — useful as a structured
              second opinion, but not validated as a standalone investment strategy.
            </p>
            <p className="pledge-commitment">
              <strong>What is live today:</strong>
            </p>
            <p>
              The <Link href="/performance">live performance page</Link> publishes a daily, locked-in
              snapshot of every QScore and price we compute. Each snapshot is committed to public
              source control on the date shown — no revisionism is possible, and forward returns
              against those snapshots are what feed the backtest pledge above as data accrues.
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
        <p className="footer-links">
          <a href="/glossary">Glossary</a>
          <span className="sep">·</span>
          <a href="/scores">Categories</a>
          <span className="sep">·</span>
          <a href="/compare">Compare</a>
          <span className="sep">·</span>
          <a href="/score">Score a ticker</a>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
