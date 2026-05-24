/**
 * Blog post registry. Each post is a fully-typed entry with metadata
 * (title, description, publishedAt, excerpt, cluster) and a Body() React
 * function that renders the post content. The /blog index reads metadata
 * for the listing; /blog/[slug] looks up the post by slug and renders Body.
 *
 * Posts are organized into clusters for SEO topical-authority signaling
 * (every post links to others in its cluster + to live product surfaces).
 * Cluster-index pages live at /blog/{cluster-slug}.
 *
 * Quality bar is high: hand-written, evergreen where possible, deeply
 * cross-linked to /methodology, /glossary/*, /scores, /compare, /score/*.
 * Auto-generated ticker-month posts stay deferred — the Helpful Content
 * penalty surface is real and we'd rather under-publish than dilute.
 */

import dynamic from "next/dynamic";
import Link from "next/link";

// Lazy-loaded post Bodies. Keeping large Body() components out of the
// startup bundle avoids hitting the Cloudflare Workers 400ms startup CPU
// budget — the registry below stays metadata-light, and each body is
// loaded as a separate chunk only when its slug is rendered.
const CreditScoringBreakdownBody = dynamic(
  () => import("@/app/blog/bodies/credit-scoring-breakdown")
);
const PredictingLoanDefaultsBody = dynamic(
  () => import("@/app/blog/bodies/predicting-loan-defaults")
);
const DetectingCreditCardFraudBody = dynamic(
  () => import("@/app/blog/bodies/detecting-credit-card-fraud")
);
const TestingStockFactorsSp500Body = dynamic(
  () => import("@/app/blog/bodies/testing-stock-factors-sp500")
);
const TestingStockFactorsCryptoBody = dynamic(
  () => import("@/app/blog/bodies/testing-stock-factors-crypto")
);
const StockMarketAroundMemorialDayBody = dynamic(
  () => import("@/app/blog/bodies/stock-market-around-memorial-day")
);

export type BlogCluster =
  | "qscore-methodology"
  | "factor-investing"
  | "stock-comparisons"
  | "stock-metrics"
  | "market-signals";

export type ClusterDef = {
  slug: BlogCluster;
  title: string;
  description: string;
  intro: string;
};

export const CLUSTERS: Record<BlogCluster, ClusterDef> = {
  "qscore-methodology": {
    slug: "qscore-methodology",
    title: "QScore methodology",
    description:
      "How the QScore is built — the five factors, how they combine, how the signal is derived, and what it means in practice.",
    intro:
      "Posts in this cluster explain the mechanics behind the QScore: what each factor measures, how they're weighted, and how the signal turns the composite into a directional verdict.",
  },
  "factor-investing": {
    slug: "factor-investing",
    title: "Factor investing",
    description:
      "Plain-English explainers on the academic factor framework that underlies the QScore.",
    intro:
      "Factor investing — the academic framework that powers most modern quant strategies. Posts here explain each factor in detail with real-world examples and link to the live ticker scores.",
  },
  "stock-comparisons": {
    slug: "stock-comparisons",
    title: "Stock comparisons",
    description:
      "Editorial analysis of head-to-head stock matchups using the QScore framework.",
    intro:
      "When two stocks compete in the same space, the QScore factor breakdowns reveal what the market is actually rewarding. These posts dig into the differences behind popular head-to-head matchups.",
  },
  "stock-metrics": {
    slug: "stock-metrics",
    title: "Stock metrics",
    description:
      "Deep-dive explainers on individual financial metrics — what they measure, how they're computed, and where they fail.",
    intro:
      "Every metric the QScore consumes has a story. These posts go beyond the glossary definition into how each metric is actually computed, when it's most useful, and the common pitfalls when reading it.",
  },
  "market-signals": {
    slug: "market-signals",
    title: "Market signals",
    description:
      "Reading QScore signals in the context of broader market regime and sector rotation.",
    intro:
      "Posts on how to interpret QScore signals in the context of broader market regime, sector rotation, and macro themes.",
  },
};

export const CLUSTER_SLUGS = Object.keys(CLUSTERS) as BlogCluster[];

export type BlogPost = {
  slug: string;
  cluster: BlogCluster;
  title: string;
  description: string;
  publishedAt: string; // YYYY-MM-DD
  readTimeMinutes: number;
  excerpt: string;
  // ComponentType (not `() => ReactNode`) so dynamic-imported bodies
  // (via next/dynamic) are assignable; inline `() => (<>...</>)` bodies
  // remain assignable because their narrower signature widens cleanly.
  Body: React.ComponentType<Record<string, never>>;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-read-a-qscore",
    cluster: "qscore-methodology",
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
    cluster: "qscore-methodology",
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
  {
    slug: "nvda-vs-amd",
    cluster: "stock-comparisons",
    title: "NVDA vs AMD: how the QScore breakdown reveals two different AI bets",
    description:
      "NVIDIA and AMD both make the chips powering the AI buildout, but the QScore factor breakdown shows they're very different bets. A walkthrough of where they overlap, where they diverge, and what the live numbers say.",
    publishedAt: "2026-05-08",
    readTimeMinutes: 7,
    excerpt:
      "Same sector, similar narrative, very different factor profiles. Here's what the QScore breakdown reveals about NVDA vs AMD — and why treating them as interchangeable AI plays is the most common mistake.",
    Body: () => (
      <>
        <p>
          NVIDIA and AMD both make the chips powering the AI buildout. Both are in the
          Semiconductor industry under the Technology sector. Both have ridden multi-year
          rallies. The natural assumption is that they&apos;re interchangeable bets on the same
          theme — buy one, you might as well have bought the other.
        </p>
        <p>
          The QScore factor breakdown tells a different story. Open the{" "}
          <Link href="/compare/nvda-vs-amd">live NVDA vs AMD comparison</Link> and the
          composite scores tend to land within a few points of each other, but the underlying
          factor mix is materially different. This post walks through where they overlap, where
          they diverge, and how to read the breakdown without falling into the
          &ldquo;they&apos;re the same trade&rdquo; trap.
        </p>

        <h2>Where they overlap</h2>
        <p>
          The headline similarity is real. Both companies sell GPUs into the data-center market.
          Both have benefitted enormously from the post-2022 surge in AI compute spend. Both
          trade as Tier-1 names in the Semiconductors industry, which means they get
          sector-normalized against the same peer set when QScoring computes their factor
          z-scores.
        </p>
        <p>
          That sector normalization matters. A 30% revenue growth rate is treated very
          differently in Semiconductors than in Utilities — and{" "}
          <Link href="/glossary/sector-normalization">sector-relative scoring</Link> is what
          lets the QScore tell you who&apos;s strong relative to peers, not just relative to a
          generic benchmark. NVDA and AMD share the same peer denominator on every factor.
        </p>

        <h2>Where they diverge</h2>
        <p>
          The interesting differences show up factor by factor. The patterns we&apos;ve seen
          most consistently:
        </p>
        <ul>
          <li>
            <strong>Value:</strong> AMD typically scores higher on value than NVDA. NVDA&apos;s
            multi-year run has pushed its{" "}
            <Link href="/glossary/pe-ratio">P/E ratio</Link>, P/S, and EV/EBITDA into the
            upper end of the sector distribution. AMD has run too, but from a lower starting
            multiple. If you&apos;re wired to think value-first, this is the gap that matters
            most.
          </li>
          <li>
            <strong>Growth:</strong> NVDA tends to score higher on growth — its data-center
            segment compounded at multi-hundred-percent rates through 2023–2024 and the
            trailing-twelve-month numbers reflect that. AMD&apos;s growth is strong by absolute
            standards but smaller in magnitude.
          </li>
          <li>
            <strong>Momentum:</strong> usually closer between the two, with NVDA pulling ahead
            in periods when AI capex headlines dominate and AMD catching up when the trade
            broadens out. The{" "}
            <Link href="/glossary/momentum-factor">momentum factor</Link> in QScoring blends
            12-month, 3-month, and 1-month returns with{" "}
            <Link href="/glossary/rsi">RSI</Link> and moving-average position, so a single big
            news day rarely flips this.
          </li>
          <li>
            <strong>Profitability:</strong> NVDA is in a class of its own here — gross margins
            in the 70%+ range and ROE that puts it near the top of the sector distribution. AMD
            scores well but not at NVDA&apos;s tier.
          </li>
          <li>
            <strong>Risk:</strong> both score lower on risk than the sector mean would suggest,
            because the chip space is broadly more volatile than the index. Neither stock is a
            low-vol play.
          </li>
        </ul>

        <h2>The composite vs the factor pattern</h2>
        <p>
          A common pattern looks like this: NVDA composite slightly higher (driven by growth +
          profitability), AMD composite close behind (lifted by value), and very different
          shapes underneath. Two ways to read that:
        </p>
        <ul>
          <li>
            If you trust the value factor heavily, AMD looks more attractive on a risk-adjusted
            basis even when its composite is the lower of the two.
          </li>
          <li>
            If you weight growth and profitability heavily, NVDA wins on the factor signature
            — even when both composites are within rounding distance.
          </li>
        </ul>
        <p>
          That&apos;s the value of looking past the headline number. Two stocks with the same
          composite can be expressing very different bets.
        </p>

        <h2>Common mistake: treating them as interchangeable</h2>
        <p>
          The biggest analytical error we see is &ldquo;they both have similar QScores, so I
          can pick whichever is cheaper.&rdquo; That works only if you&apos;re indifferent to
          the factor exposure underneath. NVDA is a high-quality, high-growth, high-multiple
          bet. AMD is a more value-tilted bet with comparable momentum. Holding both isn&apos;t
          double-down on AI — it&apos;s a long-quality / long-value pair trade, which is a
          different exposure than holding 2x of either alone.
        </p>

        <h2>How to read the live page</h2>
        <p>
          On the <Link href="/compare/nvda-vs-amd">live comparison page</Link>, the verdict box
          at the top calls out the largest single factor gap and explains which side it favors.
          The 8-row table shows composite, signal, confidence, price, long/short-term scores,
          and all five factors, with the winner per row highlighted. Click into either ticker
          for the full breakdown and AI commentary.
        </p>

        <h2>Related reads</h2>
        <ul>
          <li>
            <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> — the
            five-factor walkthrough
          </li>
          <li>
            <Link href="/glossary/momentum-factor">Momentum factor</Link>, {" "}
            <Link href="/glossary/value-factor">value factor</Link>, {" "}
            <Link href="/glossary/profitability-factor">profitability factor</Link> in the
            glossary
          </li>
          <li>
            <Link href="/scores/ai-stocks">AI stocks category</Link> — both NVDA and AMD
            ranked alongside other AI-exposed names
          </li>
          <li>
            <Link href="/methodology#combining">Methodology: how factors combine</Link>
          </li>
        </ul>
        <p>
          Try a different pair of tickers? <Link href="/compare">Browse all comparisons</Link>{" "}
          or type any pair into <code>/compare/AAA-vs-BBB</code>.
        </p>
      </>
    ),
  },
  {
    slug: "aapl-vs-msft",
    cluster: "stock-comparisons",
    title: "AAPL vs MSFT: which megacap looks better on the quant scorecard?",
    description:
      "Apple and Microsoft are roughly the same market cap, both core index holdings, both Tier-1 quality. Their QScores often land within a few points — but the factor signatures are very different. A breakdown.",
    publishedAt: "2026-05-08",
    readTimeMinutes: 7,
    excerpt:
      "Same size, same index weight, similar composite QScores — and very different bets underneath. Here's how AAPL and MSFT diverge on the factor breakdown, and what the typical pattern means for what you're actually owning.",
    Body: () => (
      <>
        <p>
          Apple and Microsoft are the two largest companies in the S&amp;P 500 by market cap.
          Both are Tier-1 quality compounders. Both are core holdings of essentially every
          large-cap fund and ETF. Their composite QScores typically land within a few points of
          each other.
        </p>
        <p>
          The factor signatures underneath are very different. Open the{" "}
          <Link href="/compare/aapl-vs-msft">live AAPL vs MSFT comparison</Link> and the
          breakdown reveals two distinct bets dressed up in similar headline numbers. This post
          walks through what the differences actually mean.
        </p>

        <h2>The setup: same size, different shape</h2>
        <p>
          Apple sells hardware (iPhone, Mac, iPad, wearables) plus a fast-growing services
          layer (App Store, Apple Music, iCloud, payments). Microsoft sells productivity
          software (Office), cloud infrastructure (Azure), gaming (Xbox), enterprise tools
          (Teams, GitHub), and an increasing AI surface area through OpenAI integration and
          first-party Copilot products.
        </p>
        <p>
          Both fall under the same Technology sector classification, so QScoring{" "}
          <Link href="/glossary/sector-normalization">z-scores their metrics against the same
          tech-megacap peer set</Link>. The shared denominator is what makes the factor
          comparisons meaningful rather than apples-to-utilities.
        </p>

        <h2>Where they overlap</h2>
        <ul>
          <li>
            <strong>Profitability:</strong> both extraordinary. Apple&apos;s ROE looks
            astronomical (often 140%+) but is partly an artifact of years of aggressive
            buybacks shrinking the equity denominator. Microsoft&apos;s ROE is high but more
            &ldquo;structural.&rdquo; Both score in the upper tier of the profitability
            distribution.
          </li>
          <li>
            <strong>Risk:</strong> both score well — beta close to the market average and
            realized volatility lower than smaller-cap tech peers. Neither is a high-vol play.
          </li>
          <li>
            <strong>Confidence:</strong> both stocks have complete data coverage in QScoring,
            so the confidence rating is generally HIGH or MEDIUM depending on whether the
            composite lands in decisive (≥70 or ≤30) territory.
          </li>
        </ul>

        <h2>Where they diverge</h2>
        <ul>
          <li>
            <strong>Value:</strong> often comparable, with one notable trap. Apple&apos;s
            price-to-book ratio runs near 40 because aggressive buybacks have driven book
            value near zero — that&apos;s a metric distortion, not a true valuation signal.
            QScoring sector-normalizes the value metrics, which partially mitigates this, but
            the P/B reading on Apple genuinely is noisy. Microsoft&apos;s value metrics tend
            to be cleaner reads.
          </li>
          <li>
            <strong>Growth:</strong> Microsoft has typically scored higher on growth in recent
            quarters, driven by Azure&apos;s sustained 25%+ growth and Copilot monetization.
            Apple&apos;s growth has been more cyclical (depends on iPhone refresh cycle and
            services attach rate). On a year-over-year revenue basis, MSFT often pulls ahead.
          </li>
          <li>
            <strong>Momentum:</strong> regime-dependent. AI-narrative periods favor MSFT
            (OpenAI, Copilot, Azure AI workloads). Hardware-refresh or services-strength
            periods favor AAPL. The 12-month, 3-month, and 1-month returns blended into the{" "}
            <Link href="/glossary/momentum-factor">momentum factor</Link> capture this
            rotation.
          </li>
        </ul>

        <h2>Reading the typical pattern</h2>
        <p>
          The most common pattern: composite scores within 3–5 points of each other,
          profitability nearly identical, value comparable (with the AAPL P/B noise caveat),
          growth and momentum slightly favoring MSFT in current AI-cycle conditions.
        </p>
        <p>
          That means the headline composite undersells the difference. If you only look at the
          number, AAPL and MSFT can look like the same bet. The factor breakdown shows MSFT as
          a growth-and-cloud-tilted exposure and AAPL as a quality-and-buyback-yield exposure.
          Both are defensible, neither is clearly &ldquo;better,&rdquo; but they&apos;re not
          substitutable as factor positions.
        </p>

        <h2>Common mistake: ignoring the buyback distortion</h2>
        <p>
          Apple&apos;s capital return program has been the largest in corporate history. That
          warps two metrics in particular: P/B (book value squeezed near zero) and ROE
          (equity denominator shrunk artificially). Both make Apple look unusually expensive
          on P/B and unusually profitable on ROE. The reality is more moderate.
        </p>
        <p>
          QScoring&apos;s sector normalization helps because it&apos;s comparing Apple to
          other mega-caps facing similar dynamics, but the distortion is real. When you read
          Apple&apos;s value score, mentally weight it toward the P/E and P/S signals more
          than P/B. When you read its profitability score, weight it toward gross margin and
          operating margin more than ROE.
        </p>

        <h2>How to read the live page</h2>
        <p>
          The <Link href="/compare/aapl-vs-msft">live comparison page</Link> highlights the
          largest factor gap in its verdict box. Use the per-row table to spot which factors
          drive the composite difference. Open each ticker for the full metric-level breakdown
          —{" "}
          <Link href="/score/AAPL">AAPL detail</Link>,{" "}
          <Link href="/score/MSFT">MSFT detail</Link> — to see the underlying P/E, P/B,
          revenue growth, and so on.
        </p>

        <h2>Related reads</h2>
        <ul>
          <li>
            <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link>
          </li>
          <li>
            <Link href="/glossary/value-factor">Value factor</Link>, {" "}
            <Link href="/glossary/profitability-factor">profitability factor</Link>, {" "}
            <Link href="/glossary/pe-ratio">P/E ratio</Link>
          </li>
          <li>
            <Link href="/scores/large-cap-tech">Large-cap tech category</Link> — AAPL, MSFT,
            and the rest of the megacap stack ranked
          </li>
          <li>
            <Link href="/methodology#factor-value">Methodology: value section</Link> for the
            P/B caveat in detail
          </li>
        </ul>
        <p>
          Want to compare a different pair? <Link href="/compare">All comparisons</Link>, or
          type any two tickers into <code>/compare/AAA-vs-BBB</code>.
        </p>
      </>
    ),
  },
  {
    slug: "googl-vs-meta",
    cluster: "stock-comparisons",
    title: "GOOGL vs META: ad duopoly stocks under the QScore lens",
    description:
      "Search ads vs social ads. Two of the three largest digital advertising businesses on earth. Their QScore breakdowns reveal which one the model thinks is the cleaner factor bet today.",
    publishedAt: "2026-05-08",
    readTimeMinutes: 7,
    excerpt:
      "Both are ad-revenue platforms. Both ride the same digital-ad tailwind. Their composite QScores can land close — but the factor signatures show very different exposure profiles. Here's how to read the comparison.",
    Body: () => (
      <>
        <p>
          Alphabet (GOOGL) and Meta Platforms (META) together capture roughly half of US
          digital advertising spend. Both are mega-cap platform businesses with multi-billion-
          user reach, both lean heavily on ad-driven monetization, and both trade in the
          Communication Services sector. The natural framing is &ldquo;they&apos;re the ad
          duopoly, pick whichever you like.&rdquo;
        </p>
        <p>
          The QScore factor breakdown reveals a more interesting picture. Open the{" "}
          <Link href="/compare/googl-vs-meta">live GOOGL vs META comparison</Link> and the
          composite scores often land close together, but the underlying factor mix tells
          different stories. This post walks through what the comparison actually shows.
        </p>

        <h2>The setup: same business model, different revenue mix</h2>
        <p>
          Alphabet runs Search (the dominant global query engine), YouTube (the largest
          video platform), Google Cloud (a distant third behind AWS and Azure but growing),
          plus &ldquo;other bets&rdquo; like Waymo. Roughly 75–80% of revenue is still ad-
          driven, but the cloud and subscription layers are climbing.
        </p>
        <p>
          Meta runs Facebook, Instagram, WhatsApp, and Threads — a portfolio of social
          properties — plus the Reality Labs division building AR/VR (still loss-making). Ad
          revenue is closer to 95%+ of the total, with subscription services and the
          metaverse buildout as small (and in Reality Labs&apos; case, deeply negative)
          contributors.
        </p>
        <p>
          Both fall under the same sector classification in QScoring, so the{" "}
          <Link href="/glossary/sector-normalization">factor z-scoring</Link> compares them
          against the same Communication Services peer set.
        </p>

        <h2>Where they overlap</h2>
        <ul>
          <li>
            <strong>Risk:</strong> both score moderately well on risk. Beta near 1.0 (they
            are the index in many ways) and realized volatility in line with sector peers.
          </li>
          <li>
            <strong>Profitability:</strong> both have improved dramatically in recent
            quarters — META in particular went through a margin recovery in 2023–2024 after
            cutting costs aggressively. Both score in the upper tier of the sector
            distribution on operating margin and ROE.
          </li>
          <li>
            <strong>Sector:</strong> same Communication Services classification means
            they&apos;re always compared against the same peer set, so factor differences
            reflect business reality, not normalization artifacts.
          </li>
        </ul>

        <h2>Where they diverge</h2>
        <ul>
          <li>
            <strong>Value:</strong> usually comparable, sometimes slightly favoring META.
            Both trade at premium multiples by historical standards but at reasonable
            multiples relative to other mega-cap tech. Neither is &ldquo;cheap&rdquo;
            absolutely; both are &ldquo;not bubble-priced&rdquo; relative to peers.
          </li>
          <li>
            <strong>Growth:</strong> META has often pulled ahead on growth in recent
            quarters — Reels monetization, ad-pricing recovery, and aggressive efficiency
            gains have produced strong year-over-year revenue and EPS growth. GOOGL&apos;s
            growth has been more steady but less explosive.
          </li>
          <li>
            <strong>Momentum:</strong> highly regime-dependent. META rallied hard from late-
            2022 lows; GOOGL has had its own AI-narrative cycles around Gemini and Cloud.
            The <Link href="/glossary/momentum-factor">momentum factor</Link> captures
            12-month, 3-month, and 1-month return blends — so the snapshot you see depends
            on which stock has been running more recently.
          </li>
          <li>
            <strong>Profitability detail:</strong> a closer look shows META&apos;s
            improvement is partly margin recovery (so the level is high but the
            <em> trajectory</em> is what&apos;s impressive), while GOOGL&apos;s is steadier
            but with cloud investment weighing on consolidated margins.
          </li>
        </ul>

        <h2>Reading the typical pattern</h2>
        <p>
          A common pattern: GOOGL slightly higher composite (broader business, steadier
          growth, cloud optionality), META close behind (faster recent growth, comparable
          profitability, lower revenue diversification). Both signals tend to land in
          Hold-to-Buy territory in normal regimes; both can flip to short-term Buy when
          momentum runs.
        </p>
        <p>
          The factor signature difference matters more than the headline. GOOGL is a
          diversification-and-cloud-optionality bet wrapped in an ad-revenue stock. META is
          a concentrated ad-revenue play with high efficiency and still-developing AR/VR
          optionality (currently a drag, theoretically a future asset).
        </p>

        <h2>Common mistake: assuming the &ldquo;ad duopoly&rdquo; framing</h2>
        <p>
          The shorthand &ldquo;Google and Meta own digital advertising&rdquo; is true at the
          industry level but obscures the fact that their revenue exposure to a digital-ad
          downturn is very different. META is roughly 95%+ exposed; GOOGL is closer to 75%
          with growing cloud and subscription cushions. In a sharp ad-spend recession,
          they&apos;d behave differently — and the QScore factor breakdown wouldn&apos;t
          fully predict that, but the revenue diversification context matters when reading
          which stock the model is more confident in.
        </p>

        <h2>How to read the live page</h2>
        <p>
          The <Link href="/compare/googl-vs-meta">live GOOGL vs META comparison</Link>{" "}
          shows composite, signal, confidence, price, and all factor scores side by side.
          The verdict box explains which side leads on composite and what the largest factor
          driver is. Click into <Link href="/score/GOOGL">GOOGL detail</Link> or {" "}
          <Link href="/score/META">META detail</Link> for the full underlying metrics — P/E,
          revenue growth, RSI, and so on.
        </p>

        <h2>Related reads</h2>
        <ul>
          <li>
            <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link>
          </li>
          <li>
            <Link href="/blog/aapl-vs-msft">AAPL vs MSFT</Link> — another mega-cap pair
            with similar composites and divergent factor signatures
          </li>
          <li>
            <Link href="/glossary/momentum-factor">Momentum factor</Link>, {" "}
            <Link href="/glossary/profitability-factor">profitability factor</Link>, {" "}
            <Link href="/glossary/value-factor">value factor</Link>
          </li>
          <li>
            <Link href="/scores/large-cap-tech">Large-cap tech category</Link>
          </li>
        </ul>
        <p>
          Want to compare a different pair? <Link href="/compare">All comparisons</Link>, or
          type any two tickers into <code>/compare/AAA-vs-BBB</code>.
        </p>
      </>
    ),
  },
  {
    slug: "pe-ratio-explained",
    cluster: "stock-metrics",
    title: "P/E ratio explained: how to read price-to-earnings (with real ticker examples)",
    description:
      "The price-to-earnings ratio is the most-cited valuation metric in finance — what it actually measures, how it's computed, where it misleads, and how QScoring uses it as one of four value-factor inputs.",
    publishedAt: "2026-05-09",
    readTimeMinutes: 6,
    excerpt:
      "Every stock-screener tool ranks P/E. Most readers see the number without knowing exactly what's in the numerator and denominator — or why a low P/E isn't always cheap. Here's the plain-English breakdown.",
    Body: () => (
      <>
        <p>
          The price-to-earnings ratio (P/E) is the single most-cited valuation metric in finance.
          It tells you what the market is willing to pay for each dollar of a company&apos;s
          earnings. A P/E of 20 means a stock is priced at 20 times its annual earnings per
          share — pay $20 today for a $1/year claim on profits.
        </p>
        <p>
          That sounds straightforward, but the metric has more nuance than the headline number
          suggests. Different versions, different denominators, sector-specific norms, and
          structural distortions (buybacks, one-time charges) all matter when reading a P/E in
          context.
        </p>

        <h2>What the formula actually says</h2>
        <p>
          <code>P/E = Price ÷ Earnings per share</code>
        </p>
        <p>
          Both inputs need a definition. <strong>Price</strong> is straightforward — it&apos;s
          the current share price. <strong>Earnings per share</strong> is where the variations
          come in:
        </p>
        <ul>
          <li>
            <strong>TTM (trailing twelve months) EPS</strong> — actual reported earnings for
            the past four quarters. Backward-looking but real.
          </li>
          <li>
            <strong>Forward EPS</strong> — analyst consensus estimate for the next twelve
            months. Forward-looking but subject to estimate optimism bias.
          </li>
          <li>
            <strong>CAPE / Shiller P/E</strong> — averages real earnings over ten years.
            Smooths out cycle noise; mostly used for index-level analysis.
          </li>
        </ul>
        <p>
          QScoring uses <strong>TTM P/E</strong> from FMP&apos;s standardized fundamentals so
          every ticker is computed the same way.
        </p>

        <h2>How to read it</h2>
        <p>
          The naive reading: lower is cheaper, higher is expensive. Mostly true, with three
          important nuances:
        </p>
        <ul>
          <li>
            <strong>Sector matters enormously.</strong> A P/E of 35 is unremarkable in software
            (where sector norms run high) and very expensive in banking (where sector norms run
            low). This is why <Link href="/glossary/sector-normalization">sector
            normalization</Link> is critical — comparing Apple&apos;s P/E to JPMorgan&apos;s is
            like comparing the price-per-pound of a sports car to a tractor.
          </li>
          <li>
            <strong>Negative earnings break the metric.</strong> A loss-making company has
            negative EPS, which produces a negative P/E that&apos;s mathematically meaningful
            but practically useless. QScoring assigns a fixed low value score to negative-P/E
            stocks rather than ranking them as &ldquo;extremely cheap.&rdquo;
          </li>
          <li>
            <strong>Cheap can be a trap.</strong> A P/E of 6 often signals the market expects
            earnings to fall sharply. Pairing P/E with the{" "}
            <Link href="/glossary/growth-factor">growth factor</Link> reveals whether the low
            multiple reflects pessimism (potential opportunity) or accurate forecasting (a
            value trap).
          </li>
        </ul>

        <h2>How QScoring uses it</h2>
        <p>
          P/E TTM is one of four metrics in the QScoring{" "}
          <Link href="/glossary/value-factor">value factor</Link>, alongside P/B, P/S, and
          EV/EBITDA. Each is z-scored against the stock&apos;s sector with the sign inverted —
          so a low P/E maps to a high value-factor score, and vice versa. Negative-P/E stocks
          get a fixed low score rather than being thrown out, which keeps the ranking honest.
        </p>
        <p>
          Browse the <Link href="/score">live ticker scores</Link> for any name and the
          underlying P/E shows up in the value factor card&apos;s metric breakdown — both the
          raw value and the 0-100 normalized score.
        </p>

        <h2>Real example</h2>
        <p>
          Take three names from the QScoring universe: a high-multiple growth stock like{" "}
          <Link href="/score/NVDA">NVDA</Link>, a more moderate-multiple compounder like{" "}
          <Link href="/score/AAPL">AAPL</Link>, and a value-tier financial like{" "}
          <Link href="/score/JPM">JPM</Link>. The raw P/E numbers spread enormously across
          those three. Sector normalization is what makes them comparable as factor signals —
          NVDA&apos;s P/E is &ldquo;rich&rdquo; against semis but its growth profile is
          extreme; JPM&apos;s P/E is &ldquo;normal&rdquo; against banks even though absolutely
          it looks cheap.
        </p>

        <h2>Common mistakes</h2>
        <ul>
          <li>
            <strong>Comparing P/E across sectors.</strong> Always compare to sector norms (or
            use a sector-normalized score like the QScore value factor) before drawing
            conclusions.
          </li>
          <li>
            <strong>Treating forward P/E as ground truth.</strong> Analyst estimates have
            systematic optimism bias. TTM is more conservative; CAPE is most conservative.
          </li>
          <li>
            <strong>Ignoring buyback distortion.</strong> Aggressive buybacks shrink share
            count, which mechanically inflates EPS and depresses P/E without any underlying
            business improvement. Apple is the textbook case — see the{" "}
            <Link href="/blog/aapl-vs-msft">AAPL vs MSFT analysis</Link> for the full
            buyback-distortion discussion.
          </li>
          <li>
            <strong>Reading P/E without growth context.</strong> A 30 P/E with 25% growth is
            very different from a 30 P/E with 3% growth. Always pair value with growth.
          </li>
        </ul>

        <h2>Related reads</h2>
        <ul>
          <li>
            <Link href="/glossary/pe-ratio">P/E ratio in the glossary</Link> — quick reference
          </li>
          <li>
            <Link href="/glossary/value-factor">Value factor</Link> — the broader category P/E
            feeds into
          </li>
          <li>
            <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> — the
            five-factor walkthrough
          </li>
          <li>
            <Link href="/methodology#factor-value">Methodology: value section</Link>
          </li>
          <li>
            <Link href="/scores/high-growth-low-value">High-growth, low-value stocks</Link> —
            names where the value factor (including P/E) is weak
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "rsi-explained",
    cluster: "stock-metrics",
    title: "RSI explained: how to read the Relative Strength Index (and where it fails)",
    description:
      "The Relative Strength Index is the most widely-used momentum oscillator in technical analysis. What the 0-100 scale measures, where the 30/70 thresholds come from, and how QScoring uses RSI inside the momentum factor.",
    publishedAt: "2026-05-09",
    readTimeMinutes: 6,
    excerpt:
      "RSI is the workhorse momentum oscillator — overbought above 70, oversold below 30. The reality is more nuanced: extreme readings can persist for weeks, and the indicator fails most spectacularly at regime turns.",
    Body: () => (
      <>
        <p>
          The Relative Strength Index (RSI) is a bounded oscillator that ranges from 0 to 100
          and measures the magnitude of recent gains relative to recent losses. It was
          developed by J. Welles Wilder Jr. in 1978 and remains one of the most widely-used
          technical indicators five decades later.
        </p>
        <p>
          The conventional reading is simple — above 70 is &ldquo;overbought,&rdquo; below 30
          is &ldquo;oversold&rdquo; — but the simplicity hides where the indicator earns its
          keep and where it fails. Here&apos;s how to read it without falling into either of
          the two most common traps.
        </p>

        <h2>What the formula actually says</h2>
        <p>
          <code>RSI = 100 − 100 ÷ (1 + RS), where RS = avg gain ÷ avg loss over N days</code>
        </p>
        <p>
          The default lookback is N = 14 trading days. &ldquo;Avg gain&rdquo; and &ldquo;avg
          loss&rdquo; are exponential moving averages of up-days and down-days respectively
          over that window. The bounded 0-100 scale comes from the formula structure — RS goes
          from 0 (all losses) to infinity (all gains), and the transformation maps it cleanly
          to 0-100.
        </p>
        <p>
          QScoring uses RSI(14) — Wilder&apos;s original 14-day setting. Shorter windows (e.g.,
          RSI(7)) are more sensitive to recent moves; longer windows (RSI(28)) are smoother but
          slower.
        </p>

        <h2>How to read it</h2>
        <p>
          The textbook reading:
        </p>
        <ul>
          <li><strong>RSI &gt; 70</strong> — overbought, pullback may be coming</li>
          <li><strong>RSI &lt; 30</strong> — oversold, rebound may be coming</li>
          <li><strong>RSI 30–70</strong> — neutral territory</li>
        </ul>
        <p>
          That reading is right often enough to be useful but wrong often enough to be
          dangerous. Two important nuances:
        </p>
        <ul>
          <li>
            <strong>Strong trends hold extreme RSI for weeks.</strong> A stock in a powerful
            uptrend can keep RSI &gt; 70 for a month or more. &ldquo;Sell when RSI &gt;
            70&rdquo; would have you exiting every meaningful rally early.
          </li>
          <li>
            <strong>Divergence is the highest-information reading.</strong> When price makes a
            new high but RSI doesn&apos;t, the underlying momentum is weakening even as the
            tape looks strong — often the cleanest leading-indicator signal RSI produces.
          </li>
        </ul>

        <h2>How QScoring uses it</h2>
        <p>
          RSI(14) is one of five inputs in the QScoring{" "}
          <Link href="/glossary/momentum-factor">momentum factor</Link>, alongside 12-month,
          3-month, and 1-month trailing returns and the 50-day vs 200-day moving-average
          position.
        </p>
        <p>
          Unlike the trailing-return metrics (which are sector-normalized), RSI uses a fixed
          non-monotonic scoring curve. Low RSI scores well (oversold rebound potential),
          mid-high RSI also scores well (healthy momentum), but extreme high RSI scores down
          (overbought risk). The full mapping is documented on the{" "}
          <Link href="/methodology#factor-momentum">methodology page</Link>.
        </p>
        <p>
          That non-monotonic curve is intentional. Treating RSI linearly (&ldquo;higher is
          better&rdquo;) would reward stocks at exactly the moment they&apos;re most
          stretched. The curve says &ldquo;some momentum is good, too much is dangerous.&rdquo;
        </p>

        <h2>Real example</h2>
        <p>
          Browse a few <Link href="/score">live tickers</Link> and look at the RSI metric
          inside the momentum factor card. Stocks that have rallied hard recently (e.g., the
          AI-cycle leaders like <Link href="/score/NVDA">NVDA</Link> in strong-tape periods)
          often show RSI in the 65–75 range. Stocks in pullbacks show RSI in the 30s. The
          score for that metric will reflect the non-monotonic mapping — neither extreme
          scores the highest.
        </p>

        <h2>Common mistakes</h2>
        <ul>
          <li>
            <strong>Treating overbought as a sell signal in isolation.</strong> RSI &gt; 70 in
            a confirmed uptrend often means &ldquo;continue to hold&rdquo; — the divergence is
            the signal to act on, not the absolute level.
          </li>
          <li>
            <strong>Treating oversold as a buy signal in isolation.</strong> RSI &lt; 30 in a
            confirmed downtrend can persist for weeks while the stock continues falling. Pair
            with trend confirmation before acting.
          </li>
          <li>
            <strong>Using RSI on charts that are too short.</strong> RSI(14) on a 5-minute
            chart is a different beast than RSI(14) on a daily chart — the former is mostly
            noise, the latter is what most published research is calibrated against.
          </li>
          <li>
            <strong>Reading RSI without market regime context.</strong> Like all momentum
            indicators, RSI fails worst at regime turns. A high RSI just before a market top
            looks identical to a high RSI in the middle of a healthy bull run.
          </li>
        </ul>

        <h2>Related reads</h2>
        <ul>
          <li>
            <Link href="/glossary/rsi">RSI in the glossary</Link> — quick reference + formula
          </li>
          <li>
            <Link href="/glossary/momentum-factor">Momentum factor</Link> — the broader
            category RSI feeds into
          </li>
          <li>
            <Link href="/methodology#factor-momentum">Methodology: momentum section</Link> —
            full breakdown of all five inputs and the non-monotonic RSI curve
          </li>
          <li>
            <Link href="/scores/high-momentum-stocks">High-momentum stocks</Link> — names
            ranked by the momentum factor where RSI is one of the inputs
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "beta-explained",
    cluster: "stock-metrics",
    title: "Beta explained: what it measures, how it's computed, and why it can mislead",
    description:
      "Beta is the slope of a stock's returns regressed against the market — a measure of how much it moves with (or against) the index. CAPM said high beta should earn high returns; reality has been more interesting.",
    publishedAt: "2026-05-09",
    readTimeMinutes: 6,
    excerpt:
      "Beta has been finance education's go-to risk metric for sixty years. The textbook story is clean — and the empirical story is much messier. Here's what beta actually measures, where it works, and why high-beta stocks haven't paid off the way CAPM predicted.",
    Body: () => (
      <>
        <p>
          Beta is the slope of the regression line between a stock&apos;s returns and the
          market&apos;s returns. A beta of 1.0 means the stock moves one-for-one with the
          market: when the S&amp;P 500 rises 1%, the stock tends to rise 1%. A beta of 1.5
          amplifies market moves by 50%; a beta of 0.5 dampens them.
        </p>
        <p>
          The metric is simple, well-defined, and widely used. The complications are
          empirical: the elegant theory that gave us beta — the Capital Asset Pricing Model —
          made specific predictions about returns that haven&apos;t held up, which is why
          beta&apos;s role in modern quant scoring is more nuanced than its textbook
          presentation suggests.
        </p>

        <h2>What the formula actually says</h2>
        <p>
          <code>β = Cov(stock returns, market returns) ÷ Var(market returns)</code>
        </p>
        <p>
          In English: how much the stock and market move together, scaled by how much the
          market moves on its own. Computed from historical returns — usually three to five
          years of monthly or weekly data.
        </p>
        <p>
          Different providers use different lookback windows and frequencies, which is why a
          stock&apos;s &ldquo;beta&rdquo; on Yahoo Finance, FMP, and Bloomberg can differ
          slightly even at the same moment. QScoring uses the beta as reported by FMP,
          computed against ~5 years of price history — long enough to be statistically stable,
          short enough to reflect the current business profile.
        </p>

        <h2>How to read it</h2>
        <ul>
          <li><strong>β = 1.0</strong> — the stock is &ldquo;the market&rdquo; in volatility terms</li>
          <li><strong>β &gt; 1.0</strong> — amplifies market moves; &ldquo;high beta&rdquo;</li>
          <li><strong>β &lt; 1.0</strong> — dampens market moves; &ldquo;low beta&rdquo;</li>
          <li><strong>β &lt; 0</strong> — moves opposite the market; rare, often utilities or precious-metals miners</li>
        </ul>
        <p>
          The more interesting question is what to do with that information.
        </p>

        <h2>Where the textbook story breaks</h2>
        <p>
          The Capital Asset Pricing Model (Sharpe 1964, Lintner 1965) made a specific
          prediction: high-beta stocks should earn higher returns to compensate investors for
          the additional volatility. Investors are risk-averse; risk needs a price.
        </p>
        <p>
          The empirical reality has been very different. High-beta stocks have, on average,
          delivered <em>worse</em> risk-adjusted returns than low-beta stocks over multi-decade
          periods. This is the &ldquo;low-volatility anomaly&rdquo; — possibly the most
          well-replicated finding in factor research that contradicts the textbook. Frazzini
          and Pedersen&apos;s 2014 paper &ldquo;Betting Against Beta&rdquo; is the canonical
          modern treatment.
        </p>
        <p>
          The implication: high beta isn&apos;t a free ticket to higher returns. If anything,
          investors who are forced to lever up by buying high-beta stocks (because they
          can&apos;t use leverage directly) bid those names up to overpriced levels.
        </p>

        <h2>How QScoring uses it</h2>
        <p>
          Beta is one of two inputs in the QScoring{" "}
          <Link href="/glossary/risk-factor">risk factor</Link>, alongside 60-day annualized
          realized volatility. Stocks with beta closer to 1.0 score higher than stocks with
          extreme betas in either direction. This implements the spirit of the low-vol anomaly
          — preferring stocks that don&apos;t over-amplify market noise — without trying to
          chase pure low-vol exposure.
        </p>
        <p>
          See the <Link href="/methodology#factor-risk">risk section of the methodology</Link>{" "}
          for the full mapping curve and the regime-change weakness inherent in any
          historically-computed beta.
        </p>

        <h2>Real example</h2>
        <p>
          High-beta names in our universe tend to be growth-tier semiconductors and
          cyclical industrials. <Link href="/score/AMD">AMD</Link>,{" "}
          <Link href="/score/TSLA">TSLA</Link>, and <Link href="/score/CAT">CAT</Link> often
          run beta &gt; 1.5. Low-beta names tend to be mature consumer staples and utilities —
          <Link href="/score/KO">KO</Link>, <Link href="/score/PG">PG</Link>, and{" "}
          <Link href="/score/JNJ">JNJ</Link> typically run beta &lt; 0.7. Mega-cap tech like{" "}
          <Link href="/score/MSFT">MSFT</Link> and <Link href="/score/AAPL">AAPL</Link> sits
          near 1.0 — they essentially are the index in many ways.
        </p>

        <h2>Common mistakes</h2>
        <ul>
          <li>
            <strong>Treating beta as forward-looking.</strong> It isn&apos;t. Beta is computed
            from historical returns and assumes business profile and capital structure stayed
            roughly stable. A company that just took on huge debt or pivoted into a new
            business has a backward-looking beta that says nothing about the next year.
          </li>
          <li>
            <strong>Assuming high beta = high return.</strong> CAPM says it should; the data
            says it hasn&apos;t. Don&apos;t buy high-beta stocks just because you&apos;re
            looking for &ldquo;more upside.&rdquo;
          </li>
          <li>
            <strong>Ignoring the standard error.</strong> A beta computed from 5 years of
            monthly data has meaningful confidence intervals. A reported beta of 1.2 might
            really be &ldquo;between 0.95 and 1.45 with 95% confidence.&rdquo; Treat
            single-decimal beta readings with appropriate skepticism.
          </li>
          <li>
            <strong>Comparing betas across providers without checking methodology.</strong>{" "}
            Different lookback windows produce materially different numbers. FMP, Yahoo, and
            Bloomberg can disagree by 20%+ on the same stock at the same moment.
          </li>
        </ul>

        <h2>Related reads</h2>
        <ul>
          <li>
            <Link href="/glossary/beta">Beta in the glossary</Link> — quick reference
          </li>
          <li>
            <Link href="/glossary/risk-factor">Risk factor</Link> — the broader category beta
            feeds into
          </li>
          <li>
            <Link href="/blog/sharpe-ratio-explained">Sharpe ratio explained</Link> — the
            risk-adjusted-return metric that operationalizes the low-vol anomaly
          </li>
          <li>
            <Link href="/methodology#factor-risk">Methodology: risk section</Link>
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "sharpe-ratio-explained",
    cluster: "stock-metrics",
    title: "Sharpe ratio explained: the most-cited measure of risk-adjusted return",
    description:
      "The Sharpe ratio measures excess return per unit of volatility — finance's most-cited risk-adjusted return metric. What it measures, what counts as 'good,' and why a high Sharpe can be either signal or artifact.",
    publishedAt: "2026-05-09",
    readTimeMinutes: 6,
    excerpt:
      "Every quant strategy you'll ever read about reports its Sharpe ratio. The metric itself is decades old and well-defined; reading it well takes more nuance than 'higher is better.'",
    Body: () => (
      <>
        <p>
          The Sharpe ratio measures how much return a portfolio or strategy generates above the
          risk-free rate, per unit of volatility. It&apos;s the single most widely-cited
          risk-adjusted return metric in finance and the standard reporting unit for strategy
          performance across academic papers, hedge funds, and institutional reports.
        </p>
        <p>
          Developed by William Sharpe in 1966 (originally as the &ldquo;reward-to-variability
          ratio&rdquo;), it gives a single number that lets you compare strategies with very
          different return profiles on a common basis. A strategy returning 8% with 4%
          volatility is generally preferable to one returning 12% with 16% volatility — even
          though the second has a higher absolute return.
        </p>

        <h2>What the formula actually says</h2>
        <p>
          <code>Sharpe = (Strategy return − Risk-free rate) ÷ Strategy volatility</code>
        </p>
        <p>
          The numerator is excess return over what you could earn risk-free (typically the
          T-bill rate). The denominator is the standard deviation of the strategy&apos;s
          returns over the same window. Both are usually annualized.
        </p>
        <p>
          A Sharpe of 1.0 means the strategy earns one percentage point of excess return for
          every percentage point of volatility — historically, that&apos;s roughly the
          long-run market average.
        </p>

        <h2>What counts as &ldquo;good&rdquo;</h2>
        <ul>
          <li>
            <strong>Sharpe &lt; 0.5</strong> — weak. Volatility doesn&apos;t justify the
            return.
          </li>
          <li>
            <strong>0.5–1.0</strong> — typical for index funds and most discretionary
            strategies.
          </li>
          <li>
            <strong>1.0–2.0</strong> — good. Sustained Sharpe &gt; 1.0 is what most
            professional quant strategies aim for.
          </li>
          <li>
            <strong>2.0–3.0</strong> — very good. Reachable by well-executed market-neutral or
            multi-factor strategies.
          </li>
          <li>
            <strong>&gt; 3.0</strong> — exceptional. Often a signal that something is wrong
            with the calculation: look-ahead bias, survivorship bias, or in-sample fitting.
          </li>
        </ul>

        <h2>Where the Sharpe ratio fails</h2>
        <p>
          Sharpe is useful but blunt. Three weaknesses worth knowing:
        </p>
        <ul>
          <li>
            <strong>Treats upside and downside the same.</strong> Volatility punishes a
            strategy for moving up sharply just as much as for moving down sharply. The
            <em> Sortino ratio</em> fixes this by penalizing only downside deviation.
          </li>
          <li>
            <strong>Assumes returns are roughly normally distributed.</strong> Strategies with
            rare large losses (selling out-of-the-money options, for example) can show a high
            Sharpe right up until the tail event lands. The Sharpe is technically computed
            correctly but understates true risk.
          </li>
          <li>
            <strong>Sensitive to the measurement window.</strong> A strategy can have wildly
            different Sharpes across different five-year windows. Single-window Sharpe figures
            should be paired with rolling-window analysis to confirm stability.
          </li>
        </ul>

        <h2>How QScoring uses it</h2>
        <p>
          Sharpe ratio isn&apos;t a per-stock metric, so it doesn&apos;t enter the individual
          QScore directly. Where it matters is{" "}
          <Link href="/methodology#validation">validation</Link>: the QScoring pledge commits
          to publishing a long-short quintile-spread Sharpe of at least 1.5 before subscription
          billing turns on. That bar is deliberately conservative — Sharpe 1.5 is solidly in
          &ldquo;good&rdquo; territory for a publicly-disclosed factor strategy and high
          enough that surviving look-ahead bias scrutiny is meaningful.
        </p>
        <p>
          Until the formal backtest publishes, the{" "}
          <Link href="/performance">live performance page</Link> tracks every QScore we
          compute as it&apos;s captured — locked into public source control so the eventual
          Sharpe calculation is transparent and auditable.
        </p>

        <h2>Common mistakes</h2>
        <ul>
          <li>
            <strong>Trusting a single high Sharpe number.</strong> A backtested Sharpe of 4.0
            is more often a calculation problem than a money-printing strategy. Look for the
            rolling Sharpe, the worst-window Sharpe, and the look-ahead-bias verification
            before believing the headline.
          </li>
          <li>
            <strong>Comparing Sharpes across asset classes naively.</strong> A 1.5 Sharpe in
            equities means something different than a 1.5 Sharpe in volatility-selling
            strategies (the latter often has nasty left-tail risk Sharpe doesn&apos;t capture).
          </li>
          <li>
            <strong>Ignoring the risk-free rate input.</strong> When rates are at 0%, the
            numerator is just the strategy return. When rates are at 5%, a strategy returning
            6% is barely earning excess return at all — the Sharpe drops sharply even though
            the headline return is unchanged.
          </li>
          <li>
            <strong>Treating Sharpe as the only measure that matters.</strong> Maximum
            drawdown, time-to-recovery, and tail risk all matter. A 1.5 Sharpe with a 60%
            drawdown is not the same product as a 1.5 Sharpe with a 12% drawdown.
          </li>
        </ul>

        <h2>Related reads</h2>
        <ul>
          <li>
            <Link href="/glossary/sharpe-ratio">Sharpe ratio in the glossary</Link>
          </li>
          <li>
            <Link href="/glossary/information-coefficient">Information coefficient</Link> —
            the other validation metric that pairs with Sharpe in the QScoring pledge
          </li>
          <li>
            <Link href="/blog/beta-explained">Beta explained</Link> — the metric that
            originally tried to do what Sharpe ratio does
          </li>
          <li>
            <Link href="/methodology#validation">Validation pledge</Link> — the specific
            Sharpe bar QScoring commits to before billing turns on
          </li>
          <li>
            <Link href="/performance">Live performance tracking</Link> — the dataset the
            eventual Sharpe will be computed on
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "how-credit-scoring-models-actually-work",
    cluster: "factor-investing",
    title: "How credit scoring models actually work: a data-driven breakdown",
    description:
      "We trained a credit scoring model on 32,437 real loan applications. Here's what actually predicts default — by loan grade, income, home ownership, and loan-to-income ratio — with a working logistic regression that scores AUC 0.871.",
    publishedAt: "2026-05-21",
    readTimeMinutes: 11,
    excerpt:
      "Most explanations of credit scoring stop at \"lenders look at your income and credit history.\" That's not wrong — it's just not useful. So we pulled 32,437 real loan applications, trained a working model, and looked at what the numbers actually say.",
    Body: CreditScoringBreakdownBody,
  },
  {
    slug: "predicting-loan-defaults",
    cluster: "factor-investing",
    title: "Predicting loan defaults: what the data tells us banks miss",
    description:
      "We trained logistic regression and random forest on 67,463 real loan applications. Every headline feature lenders publish is statistically flat against default. Even random forest barely beats random — and that's the lesson.",
    publishedAt: "2026-05-21",
    readTimeMinutes: 13,
    excerpt:
      "The previous credit-risk dataset was generous: AUC 0.87 with simple logistic regression. This one isn't. 67,463 loans, 35 features, and even random forest gets to AUC 0.527 — barely above random. Data quality beats model choice, every single time.",
    Body: PredictingLoanDefaultsBody,
  },
  {
    slug: "detecting-credit-card-fraud",
    cluster: "factor-investing",
    title: "Detecting credit card fraud: when 99.8% accuracy means your model caught nothing",
    description:
      "We trained logistic regression and random forest on 284,807 European card transactions (0.173% fraud rate). ROC AUC said one model was better. PR-AUC said the opposite. With extreme class imbalance, only one of those metrics tells the truth.",
    publishedAt: "2026-05-21",
    readTimeMinutes: 14,
    excerpt:
      "A model that predicts \"not fraud\" for every transaction in this dataset is right 99.83% of the time and catches zero fraud. We trained two real fraud models on 284,807 transactions and looked at which evaluation metric actually tells the truth.",
    Body: DetectingCreditCardFraudBody,
  },
  {
    slug: "testing-stock-factors-sp500",
    cluster: "factor-investing",
    title: "Do stock factors actually work? Testing momentum, low volatility, and reversal on 5 years of S&P 500 data",
    description:
      "We tested three classic price-based factors on 619,040 days of S&P 500 data from 2013–2018: momentum, low volatility, and short-term reversal. Two worked weakly, one had the wrong sign, none were statistically significant. Here's what 5 years of real data tells us about factor investing.",
    publishedAt: "2026-05-22",
    readTimeMinutes: 15,
    excerpt:
      "After three posts on credit-side modeling, here's the equity-side test. 619,040 daily price rows. 474 names. Five years. Three factors. Momentum +3.9% annualized, low vol -6.4% (wrong sign), reversal +2.8%. The honest version of factor investing.",
    Body: TestingStockFactorsSp500Body,
  },
  {
    slug: "testing-stock-factors-crypto",
    cluster: "factor-investing",
    title: "Do stock factors work in crypto? Testing momentum, low volatility, and reversal on 1,050 tokens",
    description:
      "We tested the same three classic equity factors on 1,050 cryptocurrencies over 6 years and 1.6M daily price rows. Two are dramatically stronger in crypto than in equities; one flipped sign entirely. Same framework, different asset class, different answers.",
    publishedAt: "2026-05-22",
    readTimeMinutes: 15,
    excerpt:
      "After testing factors on 5 years of S&P 500 data and finding nothing significant, we pointed the same machinery at 1,050 cryptos over 6 years. Momentum IC went from +0.016 to +0.111 (t-stat +3.80). Low-vol flipped sign. Reversal flipped sign and lost 20%/year. The honest crypto version of factor investing.",
    Body: TestingStockFactorsCryptoBody,
  },
  {
    slug: "stock-market-around-memorial-day",
    cluster: "market-signals",
    title: "How the stock market behaves before and after Memorial Day",
    description:
      "We pulled 36 years of S&P 500 daily closes (1990–2025) and ran an event study on the 5 trading days before and after Memorial Day. Mean returns of +0.40% pre and +0.52% post, with a 67% pre-week hit rate — but neither survives a comparison against 10,000 random 5-day windows (p = 0.54, p = 0.42).",
    publishedAt: "2026-05-23",
    readTimeMinutes: 8,
    excerpt:
      "Pre-holiday drift is one of the oldest claims in market lore. We pulled 36 years of S&P 500 data around Memorial Day, compared it to 10,000 random 5-day windows, and the honest answer is: the direction matches the folklore, the magnitude is small, and the statistical test says \"not really.\"",
    Body: StockMarketAroundMemorialDayBody,
  },
];

export const BLOG_POSTS_BY_SLUG: Record<string, BlogPost> = Object.fromEntries(
  BLOG_POSTS.map((p) => [p.slug, p])
);

export function postsInCluster(cluster: BlogCluster): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.cluster === cluster).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

/**
 * Most-recently published posts across all clusters, newest first.
 * Used by the /blog index to surface "what's new" without forcing readers
 * to scroll through cluster sections.
 */
export function latestPosts(limit = 6): BlogPost[] {
  return [...BLOG_POSTS]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

/**
 * True if a post was published within the last `daysWindow` days. Used to
 * decide whether to show the "New" badge on the blog index. Anchored at
 * UTC noon to match the date-formatter and avoid timezone slop on the
 * day-boundary.
 */
export function isRecent(publishedAt: string, daysWindow = 14): boolean {
  const published = new Date(`${publishedAt}T12:00:00Z`).getTime();
  const now = Date.now();
  const ageDays = (now - published) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays < daysWindow;
}

/**
 * Most-recent publishedAt across a cluster's posts, as YYYY-MM-DD. Empty
 * string when the cluster has no posts (sorts last under lexicographic
 * descending order). Used to order clusters on the /blog index so the
 * cluster with the freshest content surfaces first.
 */
export function clusterMostRecentDate(cluster: BlogCluster): string {
  const posts = postsInCluster(cluster);
  return posts.length > 0 ? posts[0].publishedAt : "";
}

/**
 * CLUSTER_SLUGS reordered so the cluster with the most-recent post comes
 * first; clusters with no posts are dropped (the route still exists for
 * SEO, but there's no point linking to an empty page from the index).
 */
export function clustersByRecency(): BlogCluster[] {
  return CLUSTER_SLUGS
    .filter((slug) => postsInCluster(slug).length > 0)
    .sort((a, b) => clusterMostRecentDate(b).localeCompare(clusterMostRecentDate(a)));
}
