import Link from "next/link";
import type { CSSProperties } from "react";

const figureStyle: CSSProperties = { margin: "32px 0" };
const imgStyle: CSSProperties = {
  width: "100%",
  height: "auto",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  display: "block",
};
const captionStyle: CSSProperties = {
  marginTop: 12,
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  lineHeight: 1.55,
};
const captionLabel: CSSProperties = { color: "var(--text-dim)" };
const base = "/blog/crypto-factor-test";

export default function TestingStockFactorsCryptoBody() {
  return (
    <>
      <p>
        The previous post in this series —{" "}
        <Link href="/blog/testing-stock-factors-sp500">
          Do Stock Factors Actually Work?
        </Link>{" "}
        — tested three classic price-based factors on five years of S&amp;P 500 data.
        Momentum, low volatility, and short-term reversal. The honest verdict was: nothing
        was statistically significant over that window, and the low-volatility anomaly
        even had the wrong sign in a QE-era bull market.
      </p>
      <p>
        That outcome raised an obvious follow-up question: <em>was the problem the
        factors, or the data?</em> If we take the same three factors and the same
        methodology and apply them to a different asset class — one with much higher
        dispersion, much sharper trends, and much weirder microstructure — what comes
        out?
      </p>
      <p>
        So we did that. We pulled{" "}
        <a
          href="https://www.kaggle.com/datasets/ayushkhaire/top-1000-cryptos-historical"
          target="_blank"
          rel="noopener noreferrer"
        >
          ayushkhaire/top-1000-cryptos-historical
        </a>{" "}
        from Kaggle — 8.4 million daily price rows across roughly 8,500 unique crypto
        tickers from 2014 to today. After filtering to liquid tokens (mean daily dollar
        volume between $1M and $50B), excluding stablecoins, and requiring at least 500
        days of history from 2020 onwards, we kept{" "}
        <strong>1,050 cryptocurrencies</strong> with{" "}
        <strong>1.6 million daily rows</strong>.
      </p>
      <div className="metric-list-inline">
        <strong>Headline:</strong> Same three factors as the S&amp;P 500 post. Momentum
        crypto IC <strong>+0.111</strong> (vs +0.016 equities) · Low-vol IC{" "}
        <strong>+0.125</strong> (vs &minus;0.020 equities, opposite sign) · Short-term
        reversal IC <strong>&minus;0.060</strong> (vs +0.019 equities, opposite sign). All
        three statistically significant in crypto; none in equities.
      </div>

      <h2>1. The market backdrop is not what you remember</h2>
      <p>Before the factors, look at what crypto did over this window:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_universe_overview.png`}
          alt="Log-scale chart of equal-weighted crypto universe, BTC, and ETH from 2020 to 2026 — all compounded multiple times over"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 1.</strong> Equal-weighted return across
          all 1,050 names compounded to{" "}
          <strong style={captionLabel}>51× growth</strong> over six years — a{" "}
          <strong style={captionLabel}>+5,021% total return</strong>. The chart uses log
          scale because linear axes can&apos;t show this. For context: that&apos;s the
          kind of number that makes equity-factor researchers re-evaluate what &ldquo;a
          normal market&rdquo; means.
        </figcaption>
      </figure>
      <p>Two things to read carefully from that chart:</p>
      <ul>
        <li>
          <strong>Equal-weighted dominated BTC.</strong> Bitcoin compounded handsomely,
          but the long tail of mid-cap tokens did more. This is the cross-sectional
          dispersion that gives factor analysis raw material to work with.
        </li>
        <li>
          <strong>Two macro regimes are visible.</strong> The 2020-2021 explosion. The
          2022-2023 bear and recovery. The 2024-2025 ramp. Any factor strong enough to
          show up in this data has survived three meaningful regime shifts.
        </li>
      </ul>
      <p>The cross-sectional return distribution is also nothing like equities:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_monthly_returns.png`}
          alt="Histogram of monthly returns across all crypto names showing right-skewed distribution with long tail of large positive returns"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 2.</strong> Pooled monthly returns across
          1,050 names. The median monthly return is mildly negative — the typical token
          loses money in a typical month. The mean is positive because of an extreme
          right tail: a small percentage of tokens deliver +50% to +500% monthly returns,
          dragging the average up. This is the textbook profile of an asset class where
          a few winners pay for many losers.
        </figcaption>
      </figure>

      <h2>2. Information coefficients — clean and significant</h2>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_ic_time_series.png`}
          alt="IC time series for the three factors in crypto, showing momentum and low-vol clearly above zero, ST reversal below"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 3.</strong> Cross-sectional Spearman IC by
          month, 6-month rolling.{" "}
          <strong style={captionLabel}>Momentum mean IC = +0.111</strong> (t-stat{" "}
          <strong style={captionLabel}>+3.80</strong>).{" "}
          <strong style={captionLabel}>Low volatility mean IC = +0.125</strong> (t-stat{" "}
          <strong style={captionLabel}>+7.21</strong>).{" "}
          <strong style={captionLabel}>
            Short-term reversal mean IC = &minus;0.060
          </strong>{" "}
          (t-stat &minus;1.77). All three are statistically more meaningful than what we
          saw in the S&amp;P 500.
        </figcaption>
      </figure>
      <p>For comparison with the equity post:</p>
      <div className="metric-list-inline">
        <strong>Crypto vs S&amp;P 500 IC:</strong> Momentum +0.111 / +0.016 · Low-vol
        +0.125 / &minus;0.020 · Reversal &minus;0.060 / +0.019. Two factors meaningfully
        stronger in crypto; one inverted entirely.
      </div>
      <p>
        Two of the three factors are much stronger in crypto than in equities (momentum
        is 7× the IC magnitude, low volatility is 6× and with the opposite sign of what
        we saw in equities). The third — short-term reversal — flipped sign entirely
        and is now a contrarian indicator that <em>loses</em> money.
      </p>

      <h2>3. Momentum is doing real work</h2>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_momentum_quintiles.png`}
          alt="Five lines showing momentum quintile cumulative returns on log scale, with Q5 dominating clearly"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 4.</strong> Equal-weighted momentum
          quintile portfolios. Q5 (highest momentum) compounded to ~22× over six years.
          Q1 (worst momentum) compounded to ~3×. The spread is wide and the ordering is
          much closer to monotonic than what we saw in the equity post — Q4 doesn&apos;t
          dip below Q3 the way it did on S&amp;P 500 data.
        </figcaption>
      </figure>
      <p>
        The momentum factor in crypto doesn&apos;t need clever construction or
        vol-targeting to work. Simple 12-1 momentum, equal-weighted quintile portfolios,
        monthly rebalancing — and the top quintile compounds 7× more than the bottom
        over six years. That&apos;s what a factor with real signal looks like in raw
        form.
      </p>

      <h2>4. Long-short returns — and the methodological honesty bit</h2>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_long_short_returns.png`}
          alt="Long-short cumulative returns: momentum compounding strongly upward, low-vol mostly positive but volatile, reversal trending down"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 5.</strong> Long-short (top quintile minus
          bottom quintile) cumulative returns, gross of costs. Momentum compounds
          steadily. Low volatility delivers but with a vicious 2022-2023 drawdown.
          Short-term reversal is in a constant slow bleed — losing money systematically.
        </figcaption>
      </figure>
      <div className="metric-list-inline">
        <strong>Gross-of-cost results:</strong> Momentum +56%/yr, Sharpe{" "}
        <strong>1.90</strong>, max DD &minus;10% · Low-vol +38%/yr, Sharpe 1.12, max DD
        &minus;43% · Reversal &minus;20%/yr, Sharpe &minus;0.64.
      </div>
      <p>A Sharpe of 1.90 looks like a hedge-fund pitch. It deserves a paragraph of caveats:</p>
      <ul>
        <li>
          <strong>Gross of costs.</strong> Real crypto trading costs include
          taker/maker fees (3-10 bps), slippage on the bottom quintile (which contains
          the most illiquid names), and funding rates for the short leg. Net of these,
          a realistic implementation would shave 10-20 percentage points of annual
          return.
        </li>
        <li>
          <strong>Cross-sectional winsorization at the 5/95 percentile per month.</strong>{" "}
          Without it, a single token going from $0.000001 to $0.0001 (a 100× monthly
          return) would make Q5&apos;s mean explode. The winsorization is the difference
          between &ldquo;Sharpe 1.90&rdquo; and &ldquo;Sharpe 8 with a 700%
          drawdown.&rdquo; The rank-based IC is unaffected; the magnitude numbers need
          this discipline.
        </li>
        <li>
          <strong>Survivorship bias.</strong> The dataset contains tokens that exist as
          of compilation date. Coins that fully zeroed out during the 2022 bear market
          are not represented. That biases Q1 (low momentum) returns upward and makes
          the long-short spread look better than it would in a fully
          survivorship-corrected dataset.
        </li>
        <li>
          <strong>One asset class, one regime.</strong> The window from 2020 to 2026 is
          the post-COVID, crypto-as-mainstream-asset period. Earlier crypto regimes
          (the 2017-2018 ICO bubble; the 2013-2014 Mt. Gox era) had different
          microstructure. Six years isn&apos;t much.
        </li>
      </ul>

      <h2>5. Why low-volatility works in crypto when it failed in equities</h2>
      <p>
        In the <Link href="/blog/testing-stock-factors-sp500">S&amp;P 500 post</Link>,
        the low-volatility anomaly had the wrong sign — high-vol stocks beat low-vol
        stocks during the QE era. Here, low-vol works clearly: lower-vol tokens deliver
        higher forward returns.
      </p>
      <p>
        The mechanism is different from the equity case. In equities, &ldquo;low
        vol&rdquo; tends to mean utility companies and dividend payers — staid
        businesses that get bid up in risk-off and sold in risk-on. In crypto, the
        low-vol bucket is dominated by mature large-caps: <strong>BTC and ETH</strong>{" "}
        primarily, plus a tail of stablecoins-adjacent infrastructure tokens. Those
        names appreciated steadily over the test window while the high-vol tail of
        microcaps boomed and busted in cycles.
      </p>
      <p>
        So &ldquo;low vol&rdquo; in crypto is functionally a{" "}
        <strong>market-cap quality proxy</strong>, not a defensive-equity proxy.
        That&apos;s why it works in crypto and failed in equities — it&apos;s reading a
        different underlying signal in each market.
      </p>

      <h2>6. Short-term reversal flipped sign</h2>
      <p>
        This is the most interesting result of the three. In equities, the short-term
        reversal anomaly is well-documented: this-month&apos;s losers tend to be next-
        month&apos;s winners. The behavioral story is that retail investors overreact to
        short-term news and the prices correct over the following month.
      </p>
      <p>
        In crypto, the same factor has the <em>opposite</em> sign. Recent losers keep
        losing. Recent winners keep winning. The 1-month signal isn&apos;t mean-
        reverting; it&apos;s a momentum signal at a shorter horizon.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_vs_equity_ic.png`}
          alt="Side-by-side bar chart comparing S&P 500 and crypto IC for the three factors, showing dramatic differences"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 6.</strong> Same factors, same
          construction, two asset classes. The pattern is consistent with crypto being
          a faster-moving, more attention-driven market with weaker fundamental
          anchoring. Momentum and low-vol amplify; reversal inverts.
        </figcaption>
      </figure>

      <h2>7. Drawdowns — even the strong factors hurt</h2>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_factor_drawdowns.png`}
          alt="Drawdown chart showing all three factors going through 20-50% drawdowns at various points"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 7.</strong> Long-short drawdowns.
          Momentum&apos;s max drawdown is only &minus;10% — extraordinarily clean. Low
          volatility had a &minus;43% drawdown in the 2022 bear (low-vol large-caps fell
          less than micro-caps, but micro-caps had previously appreciated more, so the
          long-short blew out). Short-term reversal is in continuous drawdown — it
          never recovers because the underlying signal doesn&apos;t work.
        </figcaption>
      </figure>
      <p>Sharpe ratios with their drawdowns:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/crypto_factor_sharpe.png`}
          alt="Bar chart of factor Sharpe ratios in crypto: momentum 1.90, low-vol 1.12, ST reversal -0.64"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 8.</strong> Annualized Sharpe ratios.
          Momentum 1.90, low-vol 1.12, reversal &minus;0.64. The Sharpe-1.90 figure is
          real but, again, gross of frictions; the more conservative reading is that
          momentum has a Sharpe somewhere between 1.0 and 1.5 net of realistic costs —
          still a real signal, just less of a hedge fund pitch.
        </figcaption>
      </figure>

      <h2>8. What this means for the QScoring methodology</h2>
      <p>
        QScoring scores equities, not cryptocurrencies. But this exercise illustrates
        two principles that drive our methodology design:
      </p>
      <ul>
        <li>
          <strong>Factor signals are not universal.</strong> A factor that works on one
          asset class can be weaker, stronger, or even opposite-signed on another. The
          intuition behind why a factor exists matters as much as the historical
          record — &ldquo;why does this factor predict returns&rdquo; tells you whether
          the factor will work in a new environment.
        </li>
        <li>
          <strong>Regime matters.</strong> The S&amp;P 500 window (2013-2018) was a
          low-volatility QE era. The crypto window (2020-2026) was a high-volatility
          narrative-driven era. The same factor frameworks produced different outcomes
          because the underlying market dynamics were different. This is exactly why
          QScoring uses long-history factor validation rather than a single recent
          window — short windows pick up regime-specific results that won&apos;t
          generalize.
        </li>
      </ul>
      <p>
        If you&apos;re curious about how QScoring&apos;s equity factor construction
        differs from the simple price-only momentum we used here, the{" "}
        <Link href="/methodology">methodology page</Link> has the full disclosure: which
        features go into each of the five factors, how they&apos;re combined into the
        composite, and how each component is validated over long historical windows.
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/testing-stock-factors-sp500">
            Do Stock Factors Actually Work?
          </Link>{" "}
          — the equity-side test that this post is the crypto counterpart to
        </li>
        <li>
          <Link href="/blog/detecting-credit-card-fraud">
            Detecting Credit Card Fraud
          </Link>{" "}
          — why metric choice matters when the rare class is what you actually care
          about
        </li>
        <li>
          <Link href="/blog/predicting-loan-defaults">
            Predicting Loan Defaults
          </Link>{" "}
          — when neither logistic regression nor random forest can rescue a weak
          feature set
        </li>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> — the
          five-factor breakdown that underlies every published score
        </li>
        <li>
          <Link href="/methodology">Methodology</Link> — full QScore construction
          disclosure with long-history IC and quintile-spread metrics
        </li>
        <li>
          <a
            href="https://github.com/newhashbrown/qscoring-blogs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Reproduce this analysis on GitHub
          </a>{" "}
          — full Python pipeline (
          <code>analysis/crypto_factor_test.py</code>), charts, and pinned dependencies
        </li>
      </ul>
    </>
  );
}
