import Link from "next/link";
import { captionLabel, captionStyle, figureStyle, imgStyle } from "./styles";

const base = "/blog/testing-stock-factors-sp500";

export default function TestingStockFactorsSp500Body() {
  return (
    <>
      <p>
        The previous three posts in this series — on{" "}
        <Link href="/blog/how-credit-scoring-models-actually-work">credit risk</Link>,{" "}
        <Link href="/blog/predicting-loan-defaults">loan defaults</Link>, and{" "}
        <Link href="/blog/detecting-credit-card-fraud">credit card fraud</Link> — were
        all about classification on binary outcomes. They were also explicitly setting up a
        different kind of test: <em>can we apply the same evidence-first discipline to
        equity scoring, which is QScoring&apos;s actual job?</em>
      </p>
      <p>
        This post answers that question on real data. We pulled the{" "}
        <a
          href="https://www.kaggle.com/datasets/camnugent/sandp500"
          target="_blank"
          rel="noopener noreferrer"
        >
          camnugent/sandp500
        </a>{" "}
        Kaggle dataset — <strong>619,040 daily price rows across all 505 S&amp;P 500
        constituents from February 2013 to February 2018</strong> — and ran a clean
        cross-sectional factor test on the 474 names with full price history.
      </p>
      <p>
        Three price-based factors. Five years of data. Monthly cross-sectional ranks.
        Long-short quintile portfolios. Information coefficients with t-statistics. All
        gross of costs and computed without look-ahead.{" "}
        <strong>
          The results are not as clean as the academic literature suggests.
        </strong>
      </p>
      <div className="metric-list-inline">
        <strong>Headline:</strong> Momentum +3.9% annualized · Short-term reversal +2.8% ·
        Low volatility &minus;6.4% (wrong sign in this period). Zero of three factors had
        statistically significant IC (t-stat &gt; 2) over the 5-year window.
      </div>

      <h2>1. What we&apos;re testing and how</h2>
      <p>
        With price-only data we can&apos;t compute true fundamental-value factors like
        price-to-earnings or price-to-book — those require financial-statement data the
        Kaggle file doesn&apos;t carry. What we <em>can</em> compute, cleanly and without
        ambiguity, are the three classic price-based factors:
      </p>
      <ul>
        <li>
          <strong>Momentum (12-1)</strong> — the trailing 12 months of return, excluding
          the most recent month. This is the canonical Jegadeesh–Titman construction from
          1993, folded into Carhart&apos;s four-factor model in 1997 as the <em>WML</em>{" "}
          (winners-minus-losers) factor.
        </li>
        <li>
          <strong>Low volatility</strong> — the trailing 60-day realized volatility of
          daily returns, with sign flipped so high score = low vol. The low-vol anomaly
          was popularized by Frazzini and Pedersen&apos;s 2014 paper &ldquo;Betting Against
          Beta.&rdquo;
        </li>
        <li>
          <strong>Short-term reversal</strong> — the prior-month return, sign-flipped
          (losers ranked highest). De Bondt and Thaler 1985 and its modern monthly
          version. The behavioral story is that short-term moves overshoot and then
          mean-revert.
        </li>
      </ul>
      <p>
        For each factor and each month <code>t</code>:
      </p>
      <ul>
        <li>
          Compute the factor score using data <em>through</em> month <code>t</code> (no
          peeking at <code>t+1</code>).
        </li>
        <li>
          Compute the cross-sectional <strong>Information Coefficient</strong> — Spearman
          rank correlation between factor at <code>t</code> and forward 1-month return at{" "}
          <code>t+1</code>. IC is the equity-research equivalent of PR-AUC in
          classification: it measures rank quality where you actually operate.
        </li>
        <li>
          Sort the cross-section into 5 equal-weighted quintile portfolios. Hold for one
          month. Repeat.
        </li>
        <li>
          Compute the long-short portfolio: top quintile minus bottom quintile.
        </li>
      </ul>

      <h2>2. The market backdrop</h2>
      <p>Before looking at factors, it helps to know what the market did:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_market_overview.png`}
          alt="Cumulative growth of equal-weighted S&P 500 plus AAPL, XOM, KO over 2013-2018 showing strong bull market"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 1.</strong> Equal-weighted S&amp;P 500 (gold)
          compounded to <strong style={captionLabel}>1.91&times;</strong> over the 5-year
          window — about{" "}
          <strong style={captionLabel}>+91% total return, +14% annualized</strong>. This
          was a quintessential post-QE bull market: low rates, high multiples, narrow
          drawdowns. The interesting question for factor testing isn&apos;t whether stocks
          made money — they did, broadly — but whether <em>which</em> stocks they were
          could be predicted.
        </figcaption>
      </figure>
      <p>The monthly-return cross-section is also worth eyeballing:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_monthly_returns.png`}
          alt="Histogram of all monthly returns across all S&P 500 names showing fat-tailed distribution centered slightly above zero"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 2.</strong> Pooled monthly returns across all
          474 names &times; 61 months &asymp; 29,000 observations. Median monthly return:{" "}
          <strong style={captionLabel}>+1.4%</strong>. Mean:{" "}
          <strong style={captionLabel}>+1.3%</strong>. The distribution is fat-tailed on
          both sides — many stocks deliver &plusmn;5%+ moves in a typical month. That
          cross-sectional dispersion is the raw material a factor needs to work with.
        </figcaption>
      </figure>

      <h2>3. Information coefficients — the headline metric</h2>
      <p>The IC time series for the three factors:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_ic_time_series.png`}
          alt="Three IC time series showing all three factors hovering around zero with noisy monthly variation"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 3.</strong> Cross-sectional Spearman IC by
          month (thin lines) and 6-month rolling averages (bold). Mean ICs: momentum{" "}
          <strong style={captionLabel}>+0.016</strong>, low vol{" "}
          <strong style={captionLabel}>&minus;0.020</strong>, short-term reversal{" "}
          <strong style={captionLabel}>+0.019</strong>. The literature considers ICs in the
          0.03–0.05 range &ldquo;weakly informative&rdquo;; all three of our factors are
          below that bar on a 5-year window. None of the t-statistics exceed 2.
        </figcaption>
      </figure>
      <p>
        Read those numbers carefully. Two factors (momentum, short-term reversal) had IC
        of the expected sign — positive — but the magnitudes are small and the
        variability across months is huge. The third factor (low volatility) had IC of
        the <em>wrong sign</em>: high-vol stocks outperformed low-vol stocks in this
        period, on average.
      </p>
      <p>
        That last finding isn&apos;t a coding bug. It&apos;s a well-documented feature of
        the 2013–2018 environment: in a zero-interest-rate, QE-driven bull market,
        high-beta and high-growth names dominated. The low-volatility anomaly that worked
        decades earlier was structurally fighting the regime.
      </p>

      <h2>4. Quintile portfolios — momentum is the most well-behaved</h2>
      <p>
        IC summarizes the rank correlation. Quintile portfolios show what actually happens
        when you act on that ranking. Here&apos;s momentum:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_momentum_quintiles.png`}
          alt="Five lines showing cumulative growth of momentum quintile portfolios — Q5 (highest momentum) reaches 1.75x by 2018, Q1 reaches 1.41x"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 4.</strong> Equal-weighted momentum quintile
          portfolios, rebalanced monthly. Q1 (worst momentum) grew 1.41&times;; Q5 (best
          momentum) grew <strong style={captionLabel}>1.75&times;</strong> — a
          33-percentage-point cumulative spread. The middle quintiles aren&apos;t perfectly
          monotonic (Q4 dips below Q3), but the top-vs-bottom spread is the direction the
          literature predicts.
        </figcaption>
      </figure>
      <p>
        That said: a 33pp spread over 4+ years is not a lot. The equal-weighted S&amp;P
        500 returned 91% over the same window. The quintile spread is just over a third
        of the broad market&apos;s total return.
      </p>

      <h2>5. Long-short returns — the operational view</h2>
      <p>
        A long-short portfolio buys the top quintile and shorts the bottom quintile.
        It&apos;s the cleanest test of whether the factor carries real signal, because it
        strips out the market beta — what&apos;s left is pure factor return.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_long_short_returns.png`}
          alt="Cumulative long-short returns for momentum (positive), short-term reversal (positive), and low volatility (negative)"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 5.</strong> Long-short cumulative returns.
          Momentum compounded <strong style={captionLabel}>+21%</strong> gross over 5
          years (+3.9% annualized). Short-term reversal:{" "}
          <strong style={captionLabel}>+14%</strong> (+2.8% annualized). Low volatility:{" "}
          <strong style={captionLabel}>&minus;28%</strong> (&minus;6.4% annualized) —
          high-vol names beat low-vol names every year of this period.
        </figcaption>
      </figure>
      <div className="metric-list-inline">
        <strong>Summary table:</strong> Momentum mean IC +0.016, t-stat 0.53, Sharpe 0.35,
        max DD &minus;24.2% · ST Reversal +0.019, 1.04, 0.36, &minus;7.3% · Low Vol
        &minus;0.020, &minus;0.82, &minus;0.51, &minus;22.8%
      </div>
      <ul>
        <li>
          <strong>Sharpe ratios are modest at best.</strong> The single-factor Sharpe of
          0.35 on momentum is well below what you&apos;d need to fund a fund — typical
          institutional targets are above 1.0 net of costs.
        </li>
        <li>
          <strong>Short-term reversal had the cleanest risk profile</strong> by a wide
          margin — max drawdown of just 7.3% vs 22–24% for the other two. The cumulative
          return was small, but the path was smooth.
        </li>
      </ul>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_factor_sharpe.png`}
          alt="Bar chart of annualized Sharpe ratios: momentum +0.35, low vol -0.51, short-term reversal +0.36"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 6.</strong> Annualized Sharpe ratios. Low
          volatility&apos;s &minus;0.51 isn&apos;t just &ldquo;factor didn&apos;t
          work&rdquo; — it&apos;s &ldquo;factor worked in reverse,&rdquo; statistically
          indistinguishable from zero but consistently wrong-signed.
        </figcaption>
      </figure>

      <h2>6. Drawdowns — factors are not free lunches</h2>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_factor_drawdowns.png`}
          alt="Drawdown chart showing all three factors going through 20%+ drawdowns at various points"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 7.</strong> Drawdowns from peak.
          Momentum&apos;s 24% drawdown happened in early 2016 — the same period that
          classic &ldquo;momentum crash&rdquo; risk premia papers identify after sharp
          market dislocations. Low-vol grinds down continuously. Short-term reversal
          stays close to its peak the whole period.
        </figcaption>
      </figure>
      <p>
        If you ran any of these as a standalone strategy with real capital, you&apos;d
        need the discipline to hold through a 20%+ drawdown without changing your mind.
        Most investors can&apos;t. This is the soft constraint that makes factor investing
        harder in practice than in backtests.
      </p>

      <h2>7. Are the factors independent?</h2>
      <p>
        Combining factors into a composite score only makes sense if they carry distinct
        information. The correlation matrix:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/sp500_factor_correlation.png`}
          alt="Heatmap of correlations between the three long-short factor returns"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 8.</strong> Long-short return correlations.{" "}
          <strong style={captionLabel}>Momentum &times; Low Vol = +0.62</strong> (both
          lost out to the same high-vol names).{" "}
          <strong style={captionLabel}>Momentum &times; Reversal = &minus;0.30</strong>{" "}
          (opposite-horizon, expected).{" "}
          <strong style={captionLabel}>Low Vol &times; Reversal = &minus;0.38</strong>.
          The factors are not 3 independent bets — only the negative correlations suggest
          meaningful diversification benefit.
        </figcaption>
      </figure>
      <p>
        If you naively averaged the three factor signals into a composite score on
        2013–2018, you&apos;d effectively be double-weighting &ldquo;don&apos;t buy
        high-vol names&rdquo; (the shared bet between momentum and low-vol) and only
        partially-cancelling that with the reversal signal. Composite scoring requires
        factor de-correlation, not just factor averaging.
      </p>

      <h2>8. The honest conclusions</h2>
      <p>
        Five years of S&amp;P 500 data is not enough to confidently say a factor
        &ldquo;works&rdquo; or &ldquo;doesn&apos;t.&rdquo;
      </p>
      <p>
        The decades-long academic record on momentum is robust — but that record is built
        on ~100 years of data spanning multiple regimes. On any individual 5-year window,
        momentum can be flat, positive but weak, or even negative (the 2008–2009 momentum
        crash is famous). Our finding of &ldquo;positive but not significant&rdquo; over
        2013–2018 is consistent with the long-run literature, not in conflict with it.
      </p>
      <p>
        The low-volatility anomaly is structurally regime-dependent. It works when
        expensive low-vol stocks beat cheap high-vol ones — typically in slow-growth,
        risk-off environments. The 2013–2018 window was the opposite environment, and the
        anomaly inverted. The right read isn&apos;t &ldquo;low-vol is dead&rdquo; —
        it&apos;s &ldquo;low-vol has macro-regime exposure that long-term backtests
        average out.&rdquo;
      </p>
      <p>
        Short-term reversal had a clean low-drawdown profile but only +2.8% annualized
        gross. Subtract realistic transaction costs (5–15 bps per month at high monthly
        turnover) and the return is plausibly negative net of costs.
      </p>

      <h2>9. What QScoring does about this</h2>
      <p>
        This post is, in a sense, the empirical justification for several specific
        choices in the QScoring methodology:
      </p>
      <ul>
        <li>
          <strong>We don&apos;t rely on a single 5-year backtest.</strong> Factor
          validation uses the longest history we can construct per metric — typically
          decades — and we publish IC and quintile-spread numbers on the{" "}
          <Link href="/methodology">methodology page</Link> so users can see what the
          long-run evidence actually says, not just the in-sample fit.
        </li>
        <li>
          <strong>We use five factor categories, not one.</strong> Value, growth,
          momentum, profitability, and risk. The factors are deliberately chosen for
          their long-run academic record <em>and</em> low pairwise correlation, so the
          composite isn&apos;t accidentally double-betting on the same underlying risk.
          See <Link href="/blog/how-to-read-a-qscore">how to read a QScore</Link> for
          the full five-factor breakdown.
        </li>
        <li>
          <strong>We sector-normalize.</strong> A &ldquo;cheap&rdquo; software company
          isn&apos;t cheap the same way a &ldquo;cheap&rdquo; bank is. Every factor is
          z-scored against the stock&apos;s sector before being combined into the
          composite. This addresses one of the silent reasons naive factor backtests look
          worse than they should.
        </li>
        <li>
          <strong>We disclose the operational metric, not the vanity metric.</strong>{" "}
          Top-decile vs bottom-decile spread, annualized, against forward returns.
          That&apos;s the equity equivalent of the precision-at-top-K metric we argued
          for in our{" "}
          <Link href="/blog/detecting-credit-card-fraud">fraud detection post</Link>. R²
          and headline IC are sanity checks; the spread is what would have made or lost
          money.
        </li>
      </ul>
      <p>
        The factor zoo problem in equity research — Cochrane&apos;s &ldquo;hundreds of
        significant factors discovered&rdquo; — is the same overfitting problem we warned
        about in the <Link href="/blog/predicting-loan-defaults">loan-default post</Link>.
        The honest fix is the same one: small, vetted feature set with a real empirical
        record, evaluated on the operational metric that actually matters.
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/how-credit-scoring-models-actually-work">
            How credit scoring models actually work
          </Link>{" "}
          — the series&apos; first post, on a dataset where the features carry strong signal
        </li>
        <li>
          <Link href="/blog/predicting-loan-defaults">Predicting loan defaults</Link> —
          when neither logistic regression nor random forest can rescue a weak feature
          set
        </li>
        <li>
          <Link href="/blog/detecting-credit-card-fraud">
            Detecting credit card fraud
          </Link>{" "}
          — why ROC AUC misleads at extreme class imbalance and PR-AUC tells the truth
        </li>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> — the
          five-factor breakdown that underlies every published score
        </li>
        <li>
          <Link href="/methodology">Methodology</Link> — full QScore construction
          disclosure, including IC and quintile-spread metrics over long-run windows
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
          <code>analysis/sp500_factor_test.py</code>), charts, and pinned dependencies
        </li>
      </ul>
    </>
  );
}
