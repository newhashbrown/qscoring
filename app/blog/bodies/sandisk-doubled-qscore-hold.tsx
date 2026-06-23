import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Table styling is colocated here rather than in globals.css for the same
 * reason as the AI-IPOs and fed-rates bodies: the selectors are scoped to this
 * one post, so keeping them out of the global cold path avoids shipping them to
 * every page during the Cloudflare startup parse.
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

const numCell: CSSProperties = { ...tdStyle, color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap" };
const factorCell: CSSProperties = { ...tdStyle, color: "var(--text)", fontWeight: 600 };

export default function SandiskDoubledQscoreHoldBody() {
  return (
    <>
      <p>
        Over roughly two months, <strong>Sandisk Corporation</strong> (
        <Link href="/score/SNDK">SNDK</Link>, the flash-memory business Western Digital spun
        off into a standalone public company) went from about{" "}
        <strong>$930 in late April</strong> to a <strong>$2,274 close on June 22</strong> —
        up around <strong>140% at the peak</strong>, and roughly a double on almost any window
        you pick inside the run. It is one of the largest moves in our coverage universe this
        quarter.
      </p>
      <p>
        The obvious question &mdash; &ldquo;should I buy it?&rdquo; &mdash; isn&apos;t one a
        quant model answers. The more useful question for anyone who scores stocks is sharper:{" "}
        <strong>what did the model do while the price doubled?</strong> The answer is the
        whole post. As SNDK ran, its <Link href="/glossary/composite-score">QScore</Link>{" "}
        barely twitched &mdash; it sat at <strong>HOLD, MEDIUM confidence</strong>, parked
        between 49 and 51 the entire time. The model watched a stock double and refused to
        chase it. Here is why that&apos;s a feature, not a bug.
      </p>

      <h2>The score didn&apos;t move with the price</h2>
      <p>
        Every QScoring snapshot is frozen to git the day it&apos;s computed &mdash; an{" "}
        <Link href="/methodology#validation">append-only, no-look-ahead record</Link> of what
        the model said in real time, not a backfit. So we can put the daily QScore next to the
        daily price and watch them diverge. These are our own committed snapshots, not a
        hindsight reconstruction:
      </p>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Snapshot date</th>
              <th style={thStyle}>SNDK close</th>
              <th style={thStyle}>QScore</th>
              <th style={thStyle}>Signal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={numCell}>May 26</td>
              <td style={tdStyle}>$1,589.55</td>
              <td style={numCell}>49</td>
              <td style={tdStyle}>HOLD</td>
            </tr>
            <tr>
              <td style={numCell}>Jun 5</td>
              <td style={tdStyle}>$1,559.32</td>
              <td style={numCell}>49</td>
              <td style={tdStyle}>HOLD</td>
            </tr>
            <tr>
              <td style={numCell}>Jun 12</td>
              <td style={tdStyle}>$1,980.10</td>
              <td style={numCell}>51</td>
              <td style={tdStyle}>HOLD</td>
            </tr>
            <tr>
              <td style={numCell}>Jun 18</td>
              <td style={tdStyle}>$2,184.75</td>
              <td style={numCell}>50</td>
              <td style={tdStyle}>HOLD</td>
            </tr>
            <tr>
              <td style={numCell}>Jun 22</td>
              <td style={tdStyle}>$2,273.73</td>
              <td style={numCell}>50</td>
              <td style={tdStyle}>HOLD</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Price rose about <strong>43% across that window alone</strong>; the composite moved a
        single point. A score that tracked price would have screamed higher. This one didn&apos;t,
        because price is one input among many &mdash; and the others were pulling the opposite
        way.
      </p>

      <h2>Why HOLD: the factors disagree</h2>
      <p>
        The <Link href="/glossary/composite-score">QScore</Link> blends five factor categories.
        Splitting SNDK into its five scores shows exactly why a doubling nets to neutral:
      </p>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Factor</th>
              <th style={thStyle}>SNDK score</th>
              <th style={thStyle}>What it&apos;s saying</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={factorCell}>
                <Link href="/glossary/momentum-factor">Momentum</Link>
              </td>
              <td style={numCell}>92</td>
              <td style={tdStyle}>
                Screaming. Trailing returns, RSI, and the 50- vs 200-day moving average all
                line up behind the trend. The model fully <em>sees</em> the run.
              </td>
            </tr>
            <tr>
              <td style={factorCell}>
                <Link href="/glossary/risk-factor">Risk</Link>
              </td>
              <td style={numCell}>18</td>
              <td style={tdStyle}>
                Bottom-tier. A ~$930-to-$2,274 run with double-digit single-session swings
                produces enormous realized <Link href="/glossary/beta">volatility</Link>, which
                the risk factor penalizes hard.
              </td>
            </tr>
            <tr>
              <td style={factorCell}>
                <Link href="/glossary/value-factor">Value</Link>
              </td>
              <td style={numCell}>41</td>
              <td style={tdStyle}>
                Below average. After a double, the multiples are stretched &mdash; price ran
                faster than the fundamentals that anchor a valuation.
              </td>
            </tr>
            <tr>
              <td style={factorCell}>
                <Link href="/glossary/growth-factor">Growth</Link>
              </td>
              <td style={numCell}>41</td>
              <td style={tdStyle}>
                Below average. Real, but not keeping pace with the share price &mdash; the gap
                between the two is exactly what a stretched value score reflects.
              </td>
            </tr>
            <tr>
              <td style={factorCell}>
                <Link href="/glossary/profitability-factor">Profitability</Link>
              </td>
              <td style={numCell}>59</td>
              <td style={tdStyle}>
                Slightly above average &mdash; the one genuinely supportive pillar, and not
                enough on its own to offset the value and risk drag.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Momentum at 92 and risk at 18 are almost mirror images: the same violent move that
        makes the trend irresistible to a momentum signal makes it terrifying to a risk one.
        Net them against below-average value and growth, add a modestly supportive
        profitability, and you land at <strong>50 &mdash; dead neutral</strong>. The split also
        shows up in the horizon scores: SNDK&apos;s short-term score (57) sits above its
        long-term score (43), the model&apos;s way of saying &ldquo;the trend is real right
        now, but the longer you hold, the more the valuation and volatility matter.&rdquo;
      </p>

      <blockquote>
        <p>
          A model that printed BUY here would just be a momentum tracker wearing a composite.
          The point of blending five factors is that they&apos;re allowed to disagree &mdash;
          and when a stock doubles on momentum while value, growth, and risk lean the other
          way, the honest output is HOLD, not a victory lap.
        </p>
      </blockquote>

      <h2>What the disciplined read actually is</h2>
      <p>
        Unlike a <Link href="/blog/scoring-the-ai-ipos">fresh IPO</Link>, where the model is
        starved of data and the right answer is &ldquo;not enough history yet,&rdquo; SNDK has
        years of prints. Its <Link href="/glossary/confidence">confidence</Link> is MEDIUM, not
        LOW &mdash; the inputs are all there. This isn&apos;t the model saying &ldquo;I
        can&apos;t see it.&rdquo; It&apos;s the model saying &ldquo;I see it clearly, and the
        factors don&apos;t agree.&rdquo; That distinction matters:
      </p>
      <ol>
        <li>
          <strong>A high momentum score is a description, not a recommendation.</strong> It
          tells you the trend exists; it doesn&apos;t tell you it&apos;s durable. Paired with a
          risk score of 18, it&apos;s a flashing &ldquo;this is a fast, dangerous tape&rdquo;
          more than a green light.
        </li>
        <li>
          <strong>Watch whether the laggards catch up.</strong> The bull case isn&apos;t
          &ldquo;momentum stays at 92&rdquo; &mdash; it&apos;s value and growth climbing as
          earnings grow into the price. If the fundamentals close the gap, the composite rises
          for a good reason. If they don&apos;t, the move was multiple expansion that risk was
          right to flag.
        </li>
        <li>
          <strong>Let the volatility be the warning it is.</strong> A risk score in the
          teens after a double is the model telling you the position size that feels fine on
          the way up is the one that hurts on the way down.
        </li>
      </ol>
      <p>
        None of this is a call on whether SanDisk is a good investment. It&apos;s the opposite:
        it&apos;s the model refusing to let a big number override the four factors that
        weren&apos;t along for the ride. The entire reason to{" "}
        <Link href="/score">score a stock</Link> instead of reacting to its chart is so that a
        doubling and a HOLD can sit on the same page without contradiction &mdash; you can see
        the run, and see exactly why the model still isn&apos;t chasing it.
      </p>

      <h2>The data</h2>
      <p>
        Prices and QScores in this article are drawn from QScoring&apos;s own committed daily
        snapshots through the <strong>June 22, 2026 market close</strong>, cross-checked
        against settled end-of-day prices. SNDK refers to Sandisk Corporation, the flash-memory
        company that began trading independently after its separation from Western Digital. The
        score is recomputed every session &mdash; the{" "}
        <Link href="/score/SNDK">live SNDK page</Link> always shows the current read.
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/scoring-the-ai-ipos">Scoring the AI IPOs</Link> &mdash; the
          opposite problem: when the model has too <em>little</em> history to score a name
        </li>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> &mdash; what each
          of the five factors measures under the hood
        </li>
        <li>
          <Link href="/blog/beta-explained">Beta explained</Link> &mdash; why a violent run
          tanks the risk factor
        </li>
        <li>
          <Link href="/methodology#validation">QScoring methodology</Link> &mdash; how the
          composite is built and how confidence is assigned
        </li>
      </ul>
      <p>
        <em>
          This article is for informational purposes only and is not investment advice.
          QScoring does not hold a position in any security mentioned.
        </em>
      </p>
    </>
  );
}
