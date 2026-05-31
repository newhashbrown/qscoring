import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Table styling is colocated here rather than in globals.css for the same
 * reason as the shared figure styles (see ./styles.ts): the regime table is
 * scoped to this one body, so keeping the selectors out of the global cold
 * path avoids shipping them to every page during the Cloudflare startup parse.
 */
const tableWrap: CSSProperties = { overflowX: "auto", margin: "32px 0" };

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.9rem",
  lineHeight: 1.5,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-dim)",
  fontWeight: 600,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
  color: "var(--text-muted)",
};

const factorCell: CSSProperties = { ...tdStyle, color: "var(--text)", fontWeight: 600 };

export default function FedRatesQuantInvestingBody() {
  return (
    <>
      <p>
        Three meetings into 2026, the Fed has done nothing &mdash; and that
        &ldquo;nothing&rdquo; is the most important signal on the board. The federal funds
        target sits at <strong>3.50%&ndash;3.75%</strong>, unchanged since the January,
        March, and April FOMC meetings. The April 28&ndash;29 decision wasn&apos;t
        unanimous: Governor Stephen Miran voted to cut 25 basis points, while Beth Hammack,
        Neel Kashkari, and Lorie Logan pushed back against any language hinting at easing. A
        committee splitting in both directions at once tells you the path forward is
        genuinely contested.
      </p>
      <p>
        For a factor investor, the rate question isn&apos;t academic. It&apos;s the single
        macro variable that most reliably reorders which of your factors gets paid. So
        let&apos;s translate the current setup into something you can act on.
      </p>

      <h2>Where the Fed actually stands</h2>
      <p>
        The March 2026 dot plot &mdash; the most recent set of projections, since May
        meetings don&apos;t produce one &mdash; has the median committee member pencilling
        in a single 25bp cut this year (taking the range to 3.25%&ndash;3.50% by December)
        and one more in 2027. But the median hides the disagreement: 14 of 19 participants
        see either no cut or just one in 2026.
      </p>
      <p>
        The reason for the caution is sitting in the inflation data. The April minutes
        flagged that &ldquo;inflation is elevated, in part reflecting the recent increase
        in global energy prices,&rdquo; with Middle East supply risk keeping oil elevated
        longer than the Fed would like. On the other side of the dual mandate, the labor
        market is described as stabilizing but with downside risk &mdash; including the
        slow-burn threat of AI-driven layoffs.
      </p>
      <blockquote>
        <p>
          The base case for 2026 is not a pivot. It&apos;s a plateau with a slight downward
          bias &mdash; held hostage to oil.
        </p>
      </blockquote>
      <p>
        Markets have repriced accordingly. After expecting two cuts in January, the curve
        now prices roughly one, with a real chance of zero. J.P. Morgan&apos;s research desk
        expects the Fed on hold through year-end. Translation: don&apos;t position for an
        easing cycle that hasn&apos;t been authorized.
      </p>

      <h2>What each rate regime does to your five factors</h2>
      <p>
        Rates don&apos;t move factors uniformly. The mechanism is the discount rate &mdash;
        higher rates compress the present value of distant cash flows and reward cash flows
        you can collect now. That single idea drives most of what follows.
      </p>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Factor</th>
              <th style={thStyle}>Rising rates</th>
              <th style={thStyle}>Flat / high rates</th>
              <th style={thStyle}>Falling rates</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={factorCell}>Value</td>
              <td style={tdStyle}>Tailwind &mdash; near-term cash flows discounted less harshly</td>
              <td style={tdStyle}>Mild tailwind, especially with positive yields</td>
              <td style={tdStyle}>Mixed &mdash; long-duration growth can steal the spotlight</td>
            </tr>
            <tr>
              <td style={factorCell}>Growth</td>
              <td style={tdStyle}>Headwind &mdash; long-duration cash flows repriced down</td>
              <td style={tdStyle}>Neutral-to-soft unless earnings carry it</td>
              <td style={tdStyle}>Strong tailwind &mdash; multiple expansion returns</td>
            </tr>
            <tr>
              <td style={factorCell}>Momentum</td>
              <td style={tdStyle}>Whippy through the turn, strong once a trend sets</td>
              <td style={tdStyle}>Reliable if the regime is stable</td>
              <td style={tdStyle}>Strong, but vulnerable to sharp reversals at the pivot</td>
            </tr>
            <tr>
              <td style={factorCell}>Profitability</td>
              <td style={tdStyle}>Strong &mdash; self-funding firms don&apos;t need cheap capital</td>
              <td style={tdStyle}>Strong &mdash; the standout defensive factor</td>
              <td style={tdStyle}>Relative laggard as junkier names re-rate</td>
            </tr>
            <tr>
              <td style={factorCell}>Risk (low-vol)</td>
              <td style={tdStyle}>Defensive bid holds up</td>
              <td style={tdStyle}>Rewarded &mdash; investors pay for stability</td>
              <td style={tdStyle}>Lags as high-beta leads the rally</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>
          <Link href="/glossary/value-factor">Value</Link>
        </strong>{" "}
        is the clearest case. When the discount rate is high, a dollar of earnings today
        beats a promise of ten dollars in 2035. That&apos;s why value has been quietly
        closing its multi-year gap with growth in 2026 &mdash; and why small-cap value, up
        nearly 6% in earnings-growth terms early this year, is leading.
      </p>
      <p>
        <strong>
          <Link href="/glossary/growth-factor">Growth</Link>
        </strong>{" "}
        is the mirror image. Long-duration cash flows get repriced hardest when rates rise
        and recover most when they fall. A flat-but-high regime like today&apos;s is the
        awkward middle: growth isn&apos;t being crushed, but it isn&apos;t getting the
        multiple expansion that only rate cuts deliver.
      </p>
      <p>
        <strong>
          <Link href="/glossary/momentum-factor">Momentum</Link>
        </strong>{" "}
        is regime-agnostic in theory and regime-sensitive in practice. It does its best work
        when <em>any</em> trend is allowed to persist. The danger is the turn &mdash; the
        moment the Fed actually pivots, leadership rotates violently and a momentum book
        loaded with the old winners can give back months of gains in days.
      </p>
      <p>
        <strong>
          <Link href="/glossary/profitability-factor">Profitability</Link>
        </strong>{" "}
        (quality) is the factor that cares least about the Fed &mdash; and that&apos;s
        exactly the point. Companies that fund themselves out of operating cash flow
        don&apos;t sweat the cost of capital. In a higher-for-longer world where refinancing
        is expensive, quality is structurally advantaged.
      </p>
      <p>
        <strong>
          <Link href="/glossary/risk-factor">Risk</Link>
        </strong>{" "}
        &mdash; specifically low-volatility and low-beta &mdash; earns its keep when
        uncertainty is high and the Fed is on hold. When cuts arrive and high-beta names
        rip, low-vol underperforms. Right now, with a divided committee and oil as a
        wildcard, the defensive bid is justified.
      </p>

      <h2>The sector read-through</h2>
      <p>
        Factor tilts show up as sector tilts. The 2026 tape confirms it: a rotation is
        underway <em>out</em> of mega-cap tech and <em>into</em> basic materials (up ~9%
        year-to-date), industrials, and energy &mdash; sectors with pricing power, steady
        demand, or direct leverage to high energy prices. Utilities are catching a defensive
        bid for the same reason low-vol is.
      </p>
      <blockquote>
        <p>
          Higher-for-longer is a value, profitability, and small-cap story. A genuine pivot
          is a growth and high-beta story. We&apos;re in the first regime, watching for the
          second.
        </p>
      </blockquote>
      <p>
        The setup favors energy, materials, industrials, and utilities on the sector side,
        and value, quality, and low-volatility on the factor side. The cyclical/growth trade
        only becomes the leadership when cuts are actually on the table &mdash; and the
        committee just told you they&apos;re not, yet.
      </p>

      <h2>How to actually adjust &mdash; without overtrading</h2>
      <p>
        The temptation when you read a macro note is to rip up your weights. Resist it.
        Factor timing has a brutal track record precisely because the regime turn is
        unpredictable and the costs are real. Instead:
      </p>
      <ol>
        <li>
          <strong>Tilt, don&apos;t flip.</strong> In a held, higher-for-longer regime,
          modestly overweight profitability and value, keep a low-vol ballast, and trim
          &mdash; don&apos;t dump &mdash; long-duration growth.
        </li>
        <li>
          <strong>Pre-position momentum&apos;s exit, not its entry.</strong> Momentum is
          working now. The risk is the pivot. Cap single-name and single-sector
          concentration so a leadership flip doesn&apos;t wreck you.
        </li>
        <li>
          <strong>Make oil your trigger, not the calendar.</strong> The Fed has effectively
          outsourced its next move to energy prices. A sustained oil spike argues for more
          value/profitability/defensiveness; a collapse pulls cuts forward and brings growth
          back. Watch the input, not the meeting date.
        </li>
        <li>
          <strong>Rebalance on schedule, override on evidence.</strong> Let your normal
          cadence do the work. Only break it when a <em>durable</em> signal &mdash; not a
          single CPI print &mdash; moves your priors.
        </li>
      </ol>
      <p>
        The cleanest version of this is a portfolio where you can see all five factor
        exposures at once and watch them drift as the regime shifts. That&apos;s the whole
        point of scoring stocks instead of arguing about them &mdash;{" "}
        <Link href="/score">score a ticker</Link> and check your factor tilt against the
        rate regime in front of you, not the one you remember.
      </p>

      <h2>Sources</h2>
      <ol>
        <li>
          Board of Governors of the Federal Reserve System.{" "}
          <a
            href="https://www.federalreserve.gov/monetarypolicy/fomcminutes20260429.htm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Minutes of the Federal Open Market Committee, April 28&ndash;29, 2026
          </a>{" "}
          &mdash; target range held at 3.50%&ndash;3.75%, the split dissents, and the
          inflation/energy and labor-market discussion.
        </li>
        <li>
          BondSavvy.{" "}
          <a
            href="https://www.bondsavvy.com/fixed-income-investments-blog/fed-dot-plot"
            target="_blank"
            rel="noopener noreferrer"
          >
            March 2026 Fed Dot Plot
          </a>{" "}
          &mdash; median projection of one 25bp cut in 2026 and one in 2027, with 14 of 19
          participants seeing no more than one cut this year.
        </li>
        <li>
          J.P. Morgan Global Research.{" "}
          <a
            href="https://www.jpmorgan.com/insights/global-research/economy/fed-rate-cuts"
            target="_blank"
            rel="noopener noreferrer"
          >
            What&apos;s the Fed&apos;s next move?
          </a>{" "}
          &mdash; expectation that the Fed stays on hold through 2026, with cuts conditional
          on labor-market weakness or an energy shock.
        </li>
        <li>
          Morningstar.{" "}
          <a
            href="https://www.morningstar.com/markets/is-stock-market-rotation-underway-these-sectors-are-outpacing-tech-2026"
            target="_blank"
            rel="noopener noreferrer"
          >
            Is a Stock Market Rotation Underway? These Sectors Are Outpacing Tech in 2026
          </a>{" "}
          &mdash; basic materials, industrials, and energy leadership and the small-cap and
          value catch-up.
        </li>
      </ol>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> &mdash; what
          each of the five factors actually measures under the hood
        </li>
        <li>
          <Link href="/blog/testing-stock-factors-sp500">
            Testing stock factors on the S&amp;P 500
          </Link>{" "}
          &mdash; why the low-volatility anomaly is regime-dependent in equities
        </li>
        <li>
          <Link href="/methodology">QScoring methodology</Link> &mdash; the five-factor
          model and how the composite is built
        </li>
        <li>
          <Link href="/compare">Compare two tickers</Link> &mdash; see whose factor mix fits
          the current regime
        </li>
      </ul>
      <p>
        <em>
          This article is for informational purposes only and is not investment advice.
        </em>
      </p>
    </>
  );
}
