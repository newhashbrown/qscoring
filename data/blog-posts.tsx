/**
 * Blog post registry. Each post is a fully-typed entry with metadata
 * (title, description, publishedAt, excerpt) and a Body() React function
 * that renders the post content. The /blog index reads metadata for the
 * listing; /blog/[slug] looks up the post by slug and renders Body.
 *
 * Posts here should be quality, hand-written, evergreen, and cross-linked
 * to live product surfaces (/methodology, /glossary/*, /scores, /compare).
 * Auto-generated ticker-specific posts can be added separately later if
 * we ever decide to do them — but the bar should be deliberately high so
 * the blog never reads like AI spam.
 */

import Link from "next/link";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // YYYY-MM-DD
  readTimeMinutes: number;
  excerpt: string;
  Body: () => React.ReactNode;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-read-a-qscore",
    title: "How to read a QScore: the five factors explained",
    description:
      "A plain-English walkthrough of the five factor categories that combine into every QScore — value, growth, momentum, profitability, and risk — and what each one is actually measuring under the hood.",
    publishedAt: "2026-05-08",
    readTimeMinutes: 6,
    excerpt:
      "Every QScore is a weighted average of five factor categories, each scored from 0 to 100 against the ticker's sector. Here's what each one is actually measuring, why it's there, and how to read the breakdown when the composite alone isn't enough.",
    Body: () => (
      <>
        <p>
          The composite QScore is the headline number, but the real diagnostic value is in the
          five-factor breakdown beneath it. Two stocks can both score 65 — one because it&apos;s
          cheap with weak momentum, the other because it&apos;s expensive with strong momentum
          and clean fundamentals. Same composite, very different bets.
        </p>
        <p>
          This post walks through what each of the five factors actually measures, why it&apos;s
          in the model, and what to look for when the composite alone isn&apos;t enough.
        </p>

        <h2>Value</h2>
        <p>
          The <Link href="/glossary/value-factor">value factor</Link> measures how much the
          market is paying for the company per dollar of fundamentals — earnings, book value,
          sales, EBITDA. Lower multiples mean the stock is cheaper relative to what the business
          actually produces, which historically correlates with higher long-run returns. Value
          investing traces back to Graham &amp; Dodd in 1934 and was formalized in academic
          finance as the HML factor by Fama and French in 1993.
        </p>
        <p>
          QScoring uses four value metrics — P/E, P/B, P/S, and EV/EBITDA — z-scored against
          the stock&apos;s sector. A value score of 80 means the stock is unusually cheap
          relative to sector peers; 20 means unusually expensive.
        </p>

        <h2>Growth</h2>
        <p>
          The <Link href="/glossary/growth-factor">growth factor</Link> looks at how quickly the
          underlying business is getting bigger — year-over-year revenue, EPS, and free cash
          flow growth. Where value asks &ldquo;how much am I paying for what&apos;s already
          there,&rdquo; growth asks &ldquo;how fast is what&apos;s already there
          expanding.&rdquo; The two are often (but not always) in tension — cheap stocks tend to
          grow more slowly, fast-growing stocks tend to be expensive.
        </p>
        <p>
          A high growth score paired with a low value score is the classic
          &ldquo;expensive but growing&rdquo; profile — what {" "}
          <Link href="/scores/high-growth-low-value">high-growth, low-value stocks</Link> look
          like in our universe.
        </p>

        <h2>Momentum</h2>
        <p>
          The <Link href="/glossary/momentum-factor">momentum factor</Link> captures the
          empirical observation that stocks which have outperformed recently tend to keep
          outperforming over horizons of three to twelve months. The original work is Jegadeesh
          and Titman&apos;s 1993 paper &ldquo;Returns to Buying Winners and Selling
          Losers&rdquo;; it was later folded into Carhart&apos;s four-factor model in 1997 as
          WML (Winners-Minus-Losers).
        </p>
        <p>
          QScoring&apos;s momentum category combines five inputs: 12-month, 3-month, and 1-month
          trailing returns, plus <Link href="/glossary/rsi">RSI(14)</Link> and the 50-day vs
          200-day moving-average position. The known weakness is that momentum factors fail at
          regime turns — a stock crashing from a high RSI looks healthy right up until the
          moment it doesn&apos;t.
        </p>

        <h2>Profitability</h2>
        <p>
          The <Link href="/glossary/profitability-factor">profitability factor</Link> asks how
          much profit the business actually generates per dollar of capital invested. It was
          formalized as RMW (Robust-Minus-Weak operating profitability) in Fama and
          French&apos;s 2015 five-factor model after consistent evidence that profitable firms
          outperformed unprofitable ones even after controlling for value and size.
        </p>
        <p>
          The QScoring profitability category averages six metrics — return on equity, return
          on assets, gross margin, operating margin, net margin, and free-cash-flow yield. A 30%
          gross margin is unremarkable in software but excellent in retail, so all six are
          z-scored within sector before being combined.
        </p>

        <h2>Risk</h2>
        <p>
          The <Link href="/glossary/risk-factor">risk factor</Link> measures how much the
          stock&apos;s returns swing — both how much it co-moves with the broader market
          (<Link href="/glossary/beta">beta</Link>) and how much it moves on its own (60-day
          realized volatility). Lower volatility historically produces higher risk-adjusted
          returns — the &ldquo;low-volatility anomaly&rdquo; documented by Frazzini and
          Pedersen and others.
        </p>
        <p>
          A high risk score (closer to 100) means the stock is calmer than its peers. Counter-
          intuitively, this is the dimension where &ldquo;high score is good&rdquo; can take
          new readers a moment — it&apos;s not measuring how much risk you take, it&apos;s
          scoring the stock&apos;s risk profile relative to peers.
        </p>

        <h2>How they combine</h2>
        <p>
          The composite QScore is the average of two horizon-weighted composites: a long-term
          composite that leans on fundamentals (Value 30% / Growth 20% / Profitability 25% /
          Momentum 5% / Risk 20%) and a short-term composite that leans on the technical side
          (Momentum 40% / Risk 25% / Growth 15% / Value 10% / Profitability 10%). Full
          weighting and signal logic lives on the {" "}
          <Link href="/methodology#combining">methodology page</Link>.
        </p>

        <h2>Reading the breakdown in practice</h2>
        <p>
          When you open a {" "}
          <Link href="/score">ticker page</Link> the five factor scores sit underneath the
          composite. Look for the pattern, not just the headline number:
        </p>
        <ul>
          <li>
            <strong>Strong composite, balanced factors</strong> — a high-quality compounder.
            The score isn&apos;t hostage to any single factor.
          </li>
          <li>
            <strong>Strong composite, dominant momentum</strong> — recent price action is
            doing the heavy lifting. Watch for regime turns.
          </li>
          <li>
            <strong>Weak composite, strong value, weak everything else</strong> — a classic
            value trap candidate. Cheap for a reason.
          </li>
          <li>
            <strong>Weak composite, strong growth, weak value</strong> — expensive growth
            that hasn&apos;t earned its multiple yet.
          </li>
        </ul>
        <p>
          The composite is a starting point. The factor breakdown is what tells you what kind
          of bet a given QScore actually is.
        </p>
      </>
    ),
  },
  {
    slug: "what-is-the-qscore",
    title: "What is the QScore? A transparent quant signal for any US stock",
    description:
      "QScoring takes the well-established Fama-French factor framework and turns it into a single 1–100 score with a clear signal — fully documented, no black boxes, and free until backtested.",
    publishedAt: "2026-05-08",
    readTimeMinutes: 5,
    excerpt:
      "The QScore distills decades of factor-investing research into a single number with a clear signal. Here's what it is, how it's built, what it isn't, and the validation pledge that keeps the methodology honest.",
    Body: () => (
      <>
        <p>
          The QScore is a quantitative score from 1 to 100 for any US-listed stock. It combines
          five factor categories — value, growth, momentum, profitability, and risk — into a
          single composite, plus a directional signal (Buy Long-Term, Buy Short-Term, Hold,
          Short) and a confidence rating that reflects how complete the underlying data is.
        </p>
        <p>
          You can {" "}
          <Link href="/score">enter any ticker</Link> on QScoring.com and get the full
          breakdown in seconds. Free, no account required.
        </p>

        <h2>Where the model comes from</h2>
        <p>
          The five factors aren&apos;t novel. They map directly to decades of peer-reviewed
          academic research:
        </p>
        <ul>
          <li>
            <strong>Value</strong> — Graham &amp; Dodd&apos;s <em>Security Analysis</em> (1934),
            formalized as HML in Fama-French (1993)
          </li>
          <li>
            <strong>Growth</strong> — earnings and revenue growth as documented across decades
            of fundamentals research
          </li>
          <li>
            <strong>Momentum</strong> — Jegadeesh and Titman (1993), folded into Carhart
            (1997) as WML
          </li>
          <li>
            <strong>Profitability</strong> — RMW in Fama-French five-factor (2015)
          </li>
          <li>
            <strong>Risk</strong> — CAPM (Sharpe 1964) and the low-volatility anomaly
            (Frazzini-Pedersen 2014)
          </li>
        </ul>
        <p>
          What QScoring adds is a clean implementation: every metric is z-scored against the
          stock&apos;s sector, mapped to a 0–100 score, weighted into a composite, and turned
          into a signal — all with the math published in full on the {" "}
          <Link href="/methodology">methodology page</Link>. No proprietary alpha, no
          unexplained adjustments, no &ldquo;trust us.&rdquo;
        </p>

        <h2>What the QScore isn&apos;t</h2>
        <p>
          The score is a structured second opinion, not a strategy. It doesn&apos;t know about
          your tax situation, your portfolio correlation, your risk profile, or your time
          horizon beyond the long/short distinction the model bakes in. The same score is
          shown to everyone.
        </p>
        <p>
          It&apos;s also not yet backtested in the formal sense. The {" "}
          <Link href="/methodology#validation">validation pledge</Link> commits to publishing
          information-coefficient values, quintile-spread Sharpe ratios, and rolling-window IC
          analysis before subscription billing turns on. Until then, the {" "}
          <Link href="/performance">live performance page</Link> tracks every QScore we
          compute as it&apos;s produced — locked into public source control on the day, no
          look-ahead bias possible by construction.
        </p>

        <h2>What you can do with it today</h2>
        <p>
          A few common workflows:
        </p>
        <ul>
          <li>
            <strong>Single-ticker analysis.</strong> Type{" "}
            <Link href="/score/AAPL">AAPL</Link>, <Link href="/score/NVDA">NVDA</Link>, or any
            US ticker. You get composite, signal, confidence, factor breakdown, and AI commentary.
          </li>
          <li>
            <strong>Side-by-side comparisons.</strong> {" "}
            <Link href="/compare">/compare</Link> has curated head-to-head pages like {" "}
            <Link href="/compare/nvda-vs-amd">NVDA vs AMD</Link> and{" "}
            <Link href="/compare/aapl-vs-msft">AAPL vs MSFT</Link>, plus the URL pattern works
            for any pair.
          </li>
          <li>
            <strong>Signal-driven discovery.</strong> {" "}
            <Link href="/scores">/scores</Link> groups stocks by category — {" "}
            <Link href="/scores/buy-short-term">Buy Short-Term</Link>, {" "}
            <Link href="/scores/high-momentum-stocks">High-Momentum</Link>, {" "}
            <Link href="/scores/high-growth-low-value">High-Growth Low-Value</Link>, and more.
          </li>
          <li>
            <strong>Watchlists.</strong> On any ticker page, click Watch and we&apos;ll email
            you when the signal flips. No daily noise, only genuine changes.
          </li>
        </ul>

        <h2>How it stays honest</h2>
        <p>
          Three structural commitments keep the product from drifting into "trust us" territory:
        </p>
        <ul>
          <li>
            The full methodology — every metric, every weight, every signal threshold — is
            published. Anyone with a weekend and an FMP API key can replicate the math.
          </li>
          <li>
            Daily score snapshots are committed to public source control. The {" "}
            <Link href="/performance">performance page</Link> shows the running counter of
            locked-in observations.
          </li>
          <li>
            We won&apos;t turn on subscription billing until the validation section contains
            real Sharpe and IC numbers. Until then, the entire product is free.
          </li>
        </ul>
        <p>
          If you&apos;re new to factor investing, the {" "}
          <Link href="/blog/how-to-read-a-qscore">five-factor walkthrough</Link> is the right
          next read. Otherwise, type a ticker and have a look.
        </p>
      </>
    ),
  },
];

export const BLOG_POSTS_BY_SLUG: Record<string, BlogPost> = Object.fromEntries(
  BLOG_POSTS.map((p) => [p.slug, p])
);
