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

import Link from "next/link";

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
  Body: () => React.ReactNode;
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
];

export const BLOG_POSTS_BY_SLUG: Record<string, BlogPost> = Object.fromEntries(
  BLOG_POSTS.map((p) => [p.slug, p])
);

export function postsInCluster(cluster: BlogCluster): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.cluster === cluster).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );
}
