import Link from "next/link";
import { captionLabel, captionStyle, figureStyle, imgStyle } from "./styles";

const base = "/blog/stock-market-around-memorial-day";

export default function StockMarketAroundMemorialDayBody() {
  return (
    <>
      <p>
        Pre-holiday drift is one of the oldest folk theorems in market lore. The
        story goes: trading desks thin out, short-sellers don&apos;t want to carry
        risk over a long weekend, and the resulting bid-side imbalance pushes
        prices up into the close. The academic version traces back to Fields
        (1934) and was sharpened by Ariel (1990) and Lakonishok &amp; Smidt
        (1988), all of whom found small but persistent positive returns in the
        last day or two before US market holidays.
      </p>
      <p>
        Memorial Day is one of the cleanest holidays to test the theory on. It
        anchors a three-day weekend, falls in the &ldquo;sell in May&rdquo;
        seasonal window, and unlike Thanksgiving or Christmas doesn&apos;t share
        the calendar with a year-end tax effect. So: when traders say the market
        drifts up before Memorial Day and chops sideways after, is that actually
        true?
      </p>
      <p>
        We pulled <strong>36 years of S&amp;P 500 daily closes (1990&ndash;2025)</strong>
        from Yahoo Finance, anchored each year&apos;s observation to the trading
        day immediately before Memorial Day, and compared the 5-day pre and post
        windows against <strong>10,000 randomly chosen 5-day windows</strong> from
        the same date range. The result is a story the data tells in two
        different voices &mdash; an interesting whisper, and a statistically
        honest shrug.
      </p>
      <div className="metric-list-inline">
        <strong>Headline:</strong> Pre-Memorial-Day 5-day return averaged{" "}
        <strong>+0.40%</strong> (positive in <strong>24 of 36 years, 67%</strong>) ·
        Post-Memorial-Day 5-day return averaged <strong>+0.52%</strong> (positive in
        20 of 36 years, 56%) · <strong>Neither difference vs the random
        baseline is statistically significant</strong> (p = 0.54 pre, p = 0.42 post).
      </div>

      <h2>1. The setup</h2>
      <p>
        Memorial Day is the last Monday of May. The NYSE is closed that day, so
        any event-study has to choose an anchor. We use the trading day
        immediately before the holiday &mdash; the Friday close &mdash; as day{" "}
        <code>0</code>. The pre window covers the five trading days ending at
        that close (Monday through Friday of the holiday week). The post window
        covers the five trading days starting Tuesday after the holiday and
        running through the following Monday.
      </p>
      <ul>
        <li>
          <strong>Universe.</strong> S&amp;P 500 index (<code>^GSPC</code>) daily
          closes from 1990-01-02 through 2026-05-22. 9,165 trading days, 36
          full Memorial Day observations from 1990 through 2025.
        </li>
        <li>
          <strong>Per-event measure.</strong> Cumulative 5-day return in each of
          the pre and post windows. Multiplicative compounding, not arithmetic
          sum.
        </li>
        <li>
          <strong>Baseline.</strong> 10,000 randomly chosen anchor positions
          from the same date range, with the same 5-day-pre / 5-day-post
          calculation applied. This is the "what does any random Tuesday look
          like" comparison group.
        </li>
      </ul>
      <p>
        The reason for the random baseline is exactly the one that bites every
        seasonal-effect study: stocks have historically gone up. If you compute
        the average 5-day return of <em>any</em> random 5-day window over the
        last 36 years, you&apos;ll get something positive. That doesn&apos;t mean
        Memorial Day is special. The interesting question is whether the
        Memorial Day windows are{" "}
        <em>more positive than the random ones</em>.
      </p>

      <h2>2. The average path around Memorial Day</h2>
      <p>
        Here&apos;s the average S&amp;P 500 path across our 36 events,
        re-centered so day 0 (Friday close before the holiday) = 0%:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/memorial_day_event_study.png`}
          alt="Average S&P 500 cumulative return path from day -5 to day +5 around Memorial Day, 1990-2025, with ±1 SE band"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 1.</strong> Re-centered cumulative
          return over the [&minus;5, +5] trading-day window around Memorial Day,
          averaged across 1990&ndash;2025. The pre-week drifts up to about{" "}
          <strong style={captionLabel}>&minus;0.40% at day &minus;5 &rarr; 0%
          at day 0</strong> (i.e. a ~+0.40% rally into the holiday). The
          post-week extends another <strong style={captionLabel}>+0.52%</strong>{" "}
          on average. The shaded band is &plusmn;1 standard error &mdash; note
          that it covers the zero line on most days. The visual pattern is
          consistent with the pre-holiday drift narrative; the error band is
          consistent with that pattern being statistical noise.
        </figcaption>
      </figure>
      <p>
        Two things to read carefully here. First, the line goes up. The
        narrative isn&apos;t wrong in direction. Second, the standard-error band
        is wide. The line is climbing through a fog where the true mean might be
        anywhere from &minus;0.5% to +1.5% on any given day of the window. A
        bigger sample would tighten the band; we don&apos;t have one, because
        Memorial Day only happens once a year.
      </p>

      <h2>3. The per-year picture is messy</h2>
      <p>
        Averages hide the dispersion. Here&apos;s every individual year:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/memorial_day_yearly_pre_post.png`}
          alt="Grouped bar chart showing per-year pre and post 5-day S&P 500 returns around Memorial Day from 1990 to 2025"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 2.</strong> Pre-window (cyan) and
          post-window (amber) cumulative returns for each Memorial Day from 1990
          through 2025. The biggest pre-week was{" "}
          <strong style={captionLabel}>2022 at +6.6%</strong> &mdash; an
          inflation-panic relief rally that had nothing to do with the holiday.
          The biggest post-weeks were{" "}
          <strong style={captionLabel}>2000 (+6.5%)</strong> and{" "}
          <strong style={captionLabel}>2009 (+6.3%)</strong> &mdash; both regime
          turns. The worst pre-week was{" "}
          <strong style={captionLabel}>2008 (&minus;3.5%)</strong>, mid-financial
          crisis. The worst post-week was{" "}
          <strong style={captionLabel}>2002 (&minus;4.0%)</strong>, mid dot-com
          unwind. The signal in any given year is dominated by what the macro
          backdrop happens to be doing, not by the holiday.
        </figcaption>
      </figure>
      <p>
        This is what 36 observations looks like when you stop averaging them.
        The biggest moves in either direction line up with named macro events
        (2008 GFC, 2009 recovery, 2020 COVID rally, 2022 inflation panic).
        That&apos;s a clue that whatever &ldquo;Memorial Day effect&rdquo; exists
        is small relative to the noise that the macro regime injects.
      </p>

      <h2>4. The honest comparison: Memorial Day vs random weeks</h2>
      <p>
        Here is where the test gets sharp. We drew 10,000 random 5-day windows
        from the same 1990&ndash;2025 date range and computed the same
        statistics. If Memorial Day is special, its distribution should shift
        meaningfully relative to the baseline. It doesn&apos;t:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/memorial_day_vs_baseline.png`}
          alt="Two side-by-side histograms comparing the distribution of pre and post Memorial Day 5-day returns against 10,000 random 5-day windows"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 3.</strong> Memorial Day windows
          overlaid on the distribution of 10,000 random 5-day windows from the
          same period. Pre-window mean:{" "}
          <strong style={captionLabel}>+0.40%</strong> vs baseline{" "}
          <strong style={captionLabel}>+0.21%</strong>. Post-window mean:{" "}
          <strong style={captionLabel}>+0.52%</strong> vs baseline{" "}
          <strong style={captionLabel}>+0.18%</strong>. The Memorial Day means
          sit slightly to the right of baseline, but the Welch two-sample
          t-tests come back at <strong style={captionLabel}>p = 0.54</strong> for
          the pre window and <strong style={captionLabel}>p = 0.42</strong> for
          the post window. By any conventional standard those are noise.
        </figcaption>
      </figure>
      <p>
        Translation: if you ran this same study using a different US holiday
        with no folk story attached &mdash; or, for that matter, simulated
        Memorial Day as &ldquo;the last Monday of a randomly chosen month&rdquo;
        &mdash; you&apos;d see comparable differences from baseline a large
        fraction of the time. The pre-Memorial-Day rally is real in our data,
        but it is not statistically distinguishable from the rally you&apos;d
        get from any other randomly chosen Friday in the last 36 years.
      </p>

      <h2>5. Hit rates: where the whisper lives</h2>
      <p>
        One number is mildly intriguing &mdash; the pre-window <em>hit rate</em>,
        the share of years that closed up over the 5 trading days into the
        holiday:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/memorial_day_hit_rate.png`}
          alt="Bar chart comparing hit rates: pre window 67% vs baseline 58%, post window 56% vs baseline 57%"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 4.</strong> Pre-window hit rate:{" "}
          <strong style={captionLabel}>67%</strong> for Memorial Day vs{" "}
          <strong style={captionLabel}>58%</strong> for the random baseline.
          Post-window hit rate is essentially identical at 56% vs 57%. A 67%
          hit rate over 36 trials has a standard error of about 8 percentage
          points &mdash; meaning the &ldquo;true&rdquo; pre-week hit rate could
          plausibly be anywhere from ~50% to ~85%. The point estimate is
          interesting; the confidence interval still includes baseline.
        </figcaption>
      </figure>
      <p>
        67% is the most distinctive number we found. It&apos;s the closest the
        data comes to telling a "yes, this happens" story. But two-thirds of 36
        is 24 &mdash; we&apos;re looking at a baseline of 58% and asking whether
        24 wins is meaningfully more than the ~21 wins we&apos;d expect by
        chance. The answer is &ldquo;maybe.&rdquo; That&apos;s not a tradeable
        edge. That&apos;s an observation worth filing under{" "}
        <em>interesting if confirmed by another 50 years of data</em>.
      </p>

      <h2>6. The honest read</h2>
      <p>
        Three things are true at once, and they don&apos;t cancel out:
      </p>
      <ul>
        <li>
          <strong>The direction matches the folklore.</strong> Both windows are
          positive on average. The pre-week is up two-thirds of the time. If you
          asked a trader to guess the sign of the S&amp;P 500 over the week
          before Memorial Day, they&apos;d be right more often than wrong, and
          they&apos;d be right more often than the calendar baseline.
        </li>
        <li>
          <strong>The magnitude is small and the sample is tiny.</strong> A
          0.40% mean over 5 days, in front of an annualized realized volatility
          of ~16% (or ~2.4% per 5 days), gives you a Sharpe-style ratio per
          observation of roughly 0.16. Multiply by &radic;36 / 12 to annualize
          across years and you&apos;re sub-1.0. That&apos;s before transaction
          costs, slippage, and the cost of capital tied up waiting for a
          single window per year.
        </li>
        <li>
          <strong>The within-sample t-stat is 1.30, the test-vs-baseline
          t-stat is 0.62, and the p-values are 0.20 and 0.54.</strong>{" "}
          Neither passes the conventional t &gt; 2 / p &lt; 0.05 threshold. If
          this were submitted as a finance paper, no journal would accept it as
          evidence of an effect. The right description isn&apos;t &ldquo;the
          Memorial Day rally is dead.&rdquo; The right description is &ldquo;36
          observations isn&apos;t enough data to claim there ever was one.&rdquo;
        </li>
      </ul>
      <p>
        Pre-holiday drift studies covering many holidays at once typically find{" "}
        <em>some</em> small effect &mdash; Ariel (1990) reported pre-holiday
        returns about 9&times; daily averages on a much larger pooled sample. A
        single-holiday slice like ours has far less statistical power. Our
        finding of &ldquo;positive but not significant&rdquo; is what a small
        sample of a small effect looks like.
      </p>

      <h2>7. Why QScoring doesn&apos;t score this</h2>
      <p>
        This whole study is, in a sense, the empirical justification for what
        QScoring deliberately leaves out. We didn&apos;t build a calendar-effect
        factor for the same reason we publish factor t-statistics with our{" "}
        <Link href="/methodology">methodology page</Link>: anything that
        can&apos;t survive a real statistical test shouldn&apos;t be in the
        model.
      </p>
      <ul>
        <li>
          <strong>Calendar effects don&apos;t survive out of sample.</strong>{" "}
          Almost every paper on the pre-holiday drift, the January effect, or
          the Halloween indicator finds that the size of the effect drops &mdash;
          often to zero, sometimes to negative &mdash; after the paper is
          published. The hypothesis is that publication itself arbitrages the
          effect away. The empirical reality is that the effects were always
          marginal, and statistical noise was generous enough to make them look
          real for a few decades. That&apos;s why our{" "}
          <Link href="/blog/testing-stock-factors-sp500">
            S&amp;P 500 factor backtest
          </Link>{" "}
          insists on long-run windows and reports the unflattering t-stats.
        </li>
        <li>
          <strong>The QScore is built on durable factors with deep academic
          records.</strong> Value, growth, momentum, profitability, and risk
          &mdash; the five categories described in{" "}
          <Link href="/blog/how-to-read-a-qscore">how to read a QScore</Link>{" "}
          &mdash; have empirical records measured in <em>decades</em>, across
          countries, across asset classes, with t-stats well above 2 even after
          publication. A 36-year sample of one calendar event simply isn&apos;t
          in the same evidentiary category.
        </li>
        <li>
          <strong>A 0.40% expected return is not actionable.</strong> Even if
          the pre-Memorial-Day drift were real, the round-trip cost of putting
          on a one-week position and unwinding it &mdash; commissions, bid-ask
          spread, market impact for any non-trivial size &mdash; would eat most
          of it. The strategies that look great on paper but die after costs
          are the same ones we discussed in the{" "}
          <Link href="/blog/detecting-credit-card-fraud">
            credit-card fraud post
          </Link>: the headline metric flatters before you confront the
          economics of actually operating it.
        </li>
      </ul>
      <p>
        The right way to use a study like this isn&apos;t to trade the week
        before Memorial Day. It&apos;s to internalize how easy it is to find a
        plausible-looking pattern in 36 observations, and how often that pattern
        evaporates the moment you ask it to clear a statistical bar. The QScore
        framework is the answer to &ldquo;what would we want from a signal that
        is <em>not</em> this&rdquo; &mdash; large sample, mechanically clear
        construction, t-stats reported honestly, factors that survive
        sector-normalization and out-of-sample validation.
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/testing-stock-factors-sp500">
            Do stock factors actually work? Testing momentum, low volatility, and
            reversal on 5 years of S&amp;P 500 data
          </Link>{" "}
          &mdash; the equity-side companion to this post: same statistical
          discipline, applied to factor signals that have a real academic
          record
        </li>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link>{" "}
          &mdash; the five-factor breakdown that underlies every published score
        </li>
        <li>
          <Link href="/blog/predicting-loan-defaults">
            Predicting loan defaults
          </Link>{" "}
          &mdash; the credit-side analogue of "your model can clear AUC and still
          be telling you nothing"
        </li>
        <li>
          <Link href="/methodology">Methodology</Link> &mdash; full QScore
          construction disclosure, including the long-run IC and quintile-spread
          numbers we trust enough to publish
        </li>
        <li>
          <Link href="/scores">Live scores</Link> &mdash; the daily-updated
          QScore for every covered ticker
        </li>
        <li>
          <a
            href="https://github.com/newhashbrown/qscoring-blogs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Reproduce this analysis on GitHub
          </a>{" "}
          &mdash; full Python pipeline (
          <code>analysis/memorial_day_effect.py</code>), charts, and the per-year
          metrics JSON
        </li>
      </ul>
    </>
  );
}
