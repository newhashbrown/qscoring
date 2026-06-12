import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Table styling is colocated here rather than in globals.css for the same
 * reason as the shared figure styles (see ./styles.ts) and the fed-rates
 * regime table: the factor table is scoped to this one body, so keeping the
 * selectors out of the global cold path avoids shipping them to every page
 * during the Cloudflare startup parse.
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

export default function ScoringTheAiIposBody() {
  return (
    <>
      <p>
        After market close on June 11, SpaceX priced the largest initial public offering in
        history: <strong>555,555,555 shares at $135</strong>, raising roughly{" "}
        <strong>$75 billion</strong> and blowing past Saudi Aramco&apos;s 2019 record of
        $29.4 billion. The stock begins trading today on the Nasdaq under the ticker{" "}
        <strong>SPCX</strong>. Three days earlier, OpenAI confirmed it had{" "}
        <em>confidentially</em> filed a draft S-1 with the SEC, and Anthropic did the same on
        June 1. Three of the most-watched private companies on earth are heading for the
        public market inside the same quarter.
      </p>
      <p>
        The obvious question &mdash; &ldquo;should I buy?&rdquo; &mdash; isn&apos;t one a
        quant model answers. The more useful question for anyone who scores stocks is
        narrower and more answerable: <strong>can the model even see these names yet?</strong>{" "}
        For SpaceX, the honest answer is &ldquo;in principle, but it&apos;s starved of the
        price history three of its five factors need.&rdquo; For OpenAI, it&apos;s
        &ldquo;not yet on the board at all.&rdquo; That gap &mdash; between a name that just
        listed and a name that has only filed paperwork &mdash; is the whole story.
      </p>

      <h2>What actually happened &mdash; and what didn&apos;t</h2>
      <p>
        It&apos;s worth being precise, because the three deals are at very different stages
        and only one of them is something you can act on today.
      </p>
      <ul>
        <li>
          <strong>SpaceX is public.</strong> The S-1 filed May 20 and a roadshow priced it
          at a fixed $135. It trades as SPCX starting today. This is a real, buyable
          security with a live order book.
        </li>
        <li>
          <strong>OpenAI has only filed.</strong> A confidential draft S-1 (announced June
          8) lets a company hand financials to regulators before they&apos;re public. There
          is no ticker, no price, and no share you can buy. Reporting points to a possible
          listing window of September to November 2026 &mdash; and OpenAI has said timing
          isn&apos;t settled.
        </li>
        <li>
          <strong>Anthropic is in the same confidential-filing stage,</strong> having
          submitted its draft S-1 on June 1.
        </li>
      </ul>
      <p>
        On the numbers, the contrast is just as sharp. SpaceX&apos;s prospectus reported{" "}
        <strong>$18 billion in 2025 consolidated revenue</strong> against a{" "}
        <strong>$4.9 billion net loss</strong>, with $6.58 billion of adjusted EBITDA. The
        consolidated figure folds in two very different businesses: a profitable Starlink
        segment ($11.4 billion revenue, $4.4 billion operating profit) and a consolidated
        xAI segment that lost about $6.4 billion at the operating line on $3.2 billion of
        revenue. Founder voting control sits near 85%.
      </p>
      <p>
        OpenAI&apos;s disclosed figures are run-rate, not GAAP full-year revenue: annual
        recurring revenue crossed roughly <strong>$20 billion</strong> in 2025 (up from
        about $6 billion in 2024), while internal projections widely reported in late 2025
        point to a loss on the order of <strong>$14 billion in 2026</strong> and cumulative
        losses well into the tens of billions before any profitability. It was last valued
        around $852 billion in a March 2026 round; the trillion-dollar figures attached to
        its IPO are analyst speculation, not a printed price.
      </p>

      <h2>Why a fresh IPO is the hardest case for a factor model</h2>
      <p>
        The <Link href="/glossary/composite-score">QScore</Link> is a weighted blend of five
        factor categories. Each one needs a specific kind of input. A company that started
        trading this morning, or hasn&apos;t started at all, simply doesn&apos;t supply most
        of them &mdash; and the model is built to say so rather than guess.
      </p>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Factor</th>
              <th style={thStyle}>What it needs</th>
              <th style={thStyle}>What a day-one IPO gives it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={factorCell}>Momentum</td>
              <td style={tdStyle}>
                12-, 3-, and 1-month trailing returns, RSI(14), 50- vs 200-day moving average
              </td>
              <td style={tdStyle}>
                One day of prints &mdash; every input is undefined for months
              </td>
            </tr>
            <tr>
              <td style={factorCell}>Risk</td>
              <td style={tdStyle}>
                Beta from ~5 years of returns vs the market; 60-day realized volatility
              </td>
              <td style={tdStyle}>No regression history and no 60-day window &mdash; undefined</td>
            </tr>
            <tr>
              <td style={factorCell}>Value</td>
              <td style={tdStyle}>P/E, P/B, P/S, EV/EBITDA, z-scored against sector</td>
              <td style={tdStyle}>
                Computable, but distorted &mdash; a net loss makes trailing P/E negative
              </td>
            </tr>
            <tr>
              <td style={factorCell}>Growth</td>
              <td style={tdStyle}>
                Year-over-year revenue, EPS, and free-cash-flow growth from public filings
              </td>
              <td style={tdStyle}>
                Real and often strong &mdash; but clean sector-comparable history is thin
              </td>
            </tr>
            <tr>
              <td style={factorCell}>Profitability</td>
              <td style={tdStyle}>
                ROE, ROA, gross/operating/net margin, FCF yield
              </td>
              <td style={tdStyle}>
                Computable once filed &mdash; and for cash-burning IPOs, scores low
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>
          <Link href="/glossary/momentum-factor">Momentum</Link>
        </strong>{" "}
        is the cleanest example of the problem. It blends 12-month, 3-month, and 1-month
        trailing returns with <Link href="/glossary/rsi">RSI(14)</Link> and the 50-day
        versus 200-day moving-average position. SPCX has exactly one session of price data.
        You cannot compute a 200-day average from one day, and RSI needs a fortnight of
        up-and-down days before it means anything. This factor is mathematically undefined
        for a new listing and stays noisy for months after.
      </p>
      <p>
        <strong>
          <Link href="/glossary/risk-factor">Risk</Link>
        </strong>{" "}
        is in the same position for the same reason. <Link href="/glossary/beta">Beta</Link>{" "}
        is the slope of a stock&apos;s returns regressed against the market over years of
        history; 60-day realized volatility needs sixty trading days. On day one there is
        no regression to run and no window to measure. A factor model that reported a beta
        for SPCX this week would be inventing one.
      </p>
      <p>
        <strong>
          <Link href="/glossary/value-factor">Value</Link>
        </strong>{" "}
        is computable, but the inputs misbehave. SpaceX&apos;s $4.9 billion net loss makes
        its trailing <Link href="/glossary/pe-ratio">P/E</Link> negative &mdash; a number
        that&apos;s mathematically real and practically useless. QScoring deliberately
        assigns negative-P/E names a fixed low value score rather than ranking them as
        &ldquo;infinitely cheap.&rdquo; On EV/EBITDA, $6.58 billion of adjusted EBITDA
        against a multi-hundred-billion-dollar enterprise value is a rich multiple by any
        sector standard. For OpenAI, a possible $1 trillion valuation on roughly $20 billion
        of ARR would imply a price-to-sales ratio in territory the public market has rarely
        sustained.
      </p>
      <p>
        <strong>
          <Link href="/glossary/growth-factor">Growth</Link>
        </strong>{" "}
        is the one factor where these names look <em>strong</em>, not starved. Starlink is
        scaling fast; OpenAI&apos;s ARR more than tripled in a year. But the factor needs
        year-over-year comparisons from public filings that are{" "}
        <Link href="/glossary/sector-normalization">sector-normalized</Link>, and a company
        whose first detailed financials arrive with its IPO doesn&apos;t hand you a clean,
        comparable multi-year series on day one. The narrative is excellent; the
        model-ready history is thin.
      </p>
      <p>
        <strong>
          <Link href="/glossary/profitability-factor">Profitability</Link>
        </strong>{" "}
        is computable the moment financials are filed &mdash; and it&apos;s exactly where
        the cash-burn shows. SpaceX&apos;s consolidated net loss (the xAI segment&apos;s
        ~$6.4 billion operating loss swamping Starlink&apos;s $4.4 billion operating profit)
        and OpenAI&apos;s spend &mdash; burning a large share of revenue with multi-billion
        losses projected &mdash; both map to weak profitability scores. This factor works
        fine; it just doesn&apos;t flatter a company still buying growth with losses.
      </p>
      <blockquote>
        <p>
          Two of the five factors are mathematically undefined for a brand-new listing.
          The other three are computable but either distorted, comparable-starved, or
          unflattering. That is a low-confidence score by construction &mdash; and the model
          is supposed to say so.
        </p>
      </blockquote>
      <p>
        That last point is the honest hook. QScoring attaches a{" "}
        <Link href="/glossary/confidence">confidence rating</Link> to every score precisely
        because data completeness varies. A name missing its two price-based factors and
        carrying distorted value inputs is the textbook case for LOW confidence. The
        responsible output for SPCX this week isn&apos;t a crisp composite &mdash; it&apos;s
        &ldquo;not enough data yet.&rdquo;
      </p>

      <h2>The traps that have nothing to do with the model</h2>
      <p>
        Even setting the factors aside, freshly-public mega-caps carry structural quirks a
        single score won&apos;t capture:
      </p>
      <ul>
        <li>
          <strong>Lockups.</strong> SpaceX&apos;s prospectus points to 90- to 180-day
          lockups. When they lift &mdash; plausibly around December 2026 &mdash; early
          employees, early investors, and the bank syndicate can all sell at once. A wave of
          supply hitting at a known date is a price event no fundamental factor predicts.
        </li>
        <li>
          <strong>Governance.</strong> Founder voting control near 85% means public
          shareholders are buying economic exposure with little say. Markets often apply a
          discount for that, and it isn&apos;t in any of the five factors.
        </li>
        <li>
          <strong>Index-inclusion lag.</strong> The forced buying from S&amp;P 500 or
          Russell inclusion arrives <em>after</em> a company clears eligibility seasoning,
          not on listing day. The &ldquo;momentum&rdquo; from index demand shows up months
          later &mdash; another reason day-one price action is a poor signal.
        </li>
        <li>
          <strong>Float and concentration.</strong> A small public float relative to a huge
          valuation makes early prints volatile and easy to misread as trend.
        </li>
      </ul>

      <h2>What the disciplined quant actually does</h2>
      <p>
        The temptation around a $75 billion headline is to treat the size of the deal as if
        it were a signal. It isn&apos;t. The disciplined move is to wait for each factor to
        earn its input, and to know roughly when that happens:
      </p>
      <ol>
        <li>
          <strong>Value and profitability turn on first</strong> &mdash; at the first public
          quarter, once filed financials exist. Read them knowing the value inputs are
          distorted by losses and the profitability inputs are honest but unflattering.
        </li>
        <li>
          <strong>Realized volatility needs ~60 trading days;</strong> a stable{" "}
          <Link href="/glossary/beta">beta</Link> needs years. Until then the{" "}
          <Link href="/glossary/risk-factor">risk factor</Link> is a placeholder, not a
          read.
        </li>
        <li>
          <strong>Momentum needs 3 to 12 months</strong> of trading before its blend of
          trailing returns and RSI says anything trustworthy &mdash; and the first few
          months are contaminated by lockups and index mechanics anyway.
        </li>
        <li>
          <strong>Let confidence gate the verdict.</strong> Incomplete data means LOW{" "}
          <Link href="/glossary/confidence">confidence</Link>, and a LOW-confidence score is
          a reason to wait, not to act. We&apos;d rather print &ldquo;not yet&rdquo; than a
          composite that&apos;s mostly narrative.
        </li>
      </ol>
      <p>
        None of this is a view on whether SpaceX or OpenAI are good investments. It&apos;s
        the opposite: it&apos;s the model admitting what it can&apos;t see. A factor score is
        only as good as the history feeding it, and history is the one thing an IPO
        can&apos;t fast-forward. When SPCX has a few quarters of filings and a couple hundred
        trading days behind it, the score will mean something. Today it would mostly be a
        guess wearing a number &mdash; and the whole point of{" "}
        <Link href="/score">scoring stocks</Link> instead of arguing about them is to not do
        that.
      </p>

      <h2>Sources</h2>
      <ol>
        <li>
          NPR.{" "}
          <a
            href="https://www.npr.org/2026/06/11/nx-s1-5853199/spacex-ipo-price-elon-musk"
            target="_blank"
            rel="noopener noreferrer"
          >
            SpaceX blasts off with a record-breaking $75 billion IPO
          </a>{" "}
          &mdash; pricing of 555,555,555 shares at $135, the largest IPO on record, ahead of
          Aramco&apos;s 2019 listing.
        </li>
        <li>
          Fortune.{" "}
          <a
            href="https://fortune.com/2026/05/20/spacex-finally-files-ipo-prospectus-reveals-revenue-is-up-but-losses-are-too/"
            target="_blank"
            rel="noopener noreferrer"
          >
            SpaceX finally files IPO prospectus, reveals revenue is up &mdash; but losses are
            too
          </a>{" "}
          &mdash; $18B 2025 consolidated revenue, $4.9B net loss, and the Starlink / xAI
          segment split.
        </li>
        <li>
          CNBC.{" "}
          <a
            href="https://www.cnbc.com/2026/06/08/openai-confidentially-files-for-ipo-prepping-wall-street-for-ai-debut.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenAI confidentially files for IPO, prepping Wall Street for mega AI debut
          </a>{" "}
          &mdash; confidential draft S-1, the Sept&ndash;Nov 2026 window, and the unsettled
          timing.
        </li>
        <li>
          Fortune.{" "}
          <a
            href="https://fortune.com/2025/11/12/openai-cash-burn-rate-annual-losses-2028-profitable-2030-financial-documents/"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenAI plans to report stunning annual losses through 2028
          </a>{" "}
          &mdash; ARR scale and the multi-year loss projections behind the cash-burn picture.
        </li>
        <li>
          Anthropic.{" "}
          <a
            href="https://www.anthropic.com/news/confidential-draft-s1-sec"
            target="_blank"
            rel="noopener noreferrer"
          >
            Anthropic confidentially submits draft S-1 to the SEC
          </a>{" "}
          &mdash; the June 1, 2026 confidential filing, third of the three AI listings.
        </li>
      </ol>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> &mdash; what
          each of the five factors actually measures under the hood
        </li>
        <li>
          <Link href="/blog/beta-explained">Beta explained</Link> &mdash; why a stable beta
          needs years of returns, not days
        </li>
        <li>
          <Link href="/blog/pe-ratio-explained">P/E ratio explained</Link> &mdash; why a
          negative P/E isn&apos;t &ldquo;cheap&rdquo;
        </li>
        <li>
          <Link href="/methodology#validation">QScoring methodology</Link> &mdash; how the
          composite is built and how confidence is assigned
        </li>
      </ul>
      <p>
        <em>
          This article is for informational purposes only and is not investment advice.
          QScoring does not have a position in, and does not cover, any of the securities
          mentioned.
        </em>
      </p>
    </>
  );
}
