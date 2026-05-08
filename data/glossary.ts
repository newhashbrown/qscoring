// Glossary terms — beginner-friendly definitions of QScore-specific concepts
// and general quant finance terms that show up across the site.
//
// Inline links inside paragraphs use markdown-style syntax: [text](/url).
// The renderer in app/glossary/[slug]/page.tsx parses these into JSX <Link>s.

export type GlossaryCategory = "qscore" | "quant";

export type GlossaryTerm = {
  slug: string;
  title: string;
  category: GlossaryCategory;
  short: string;
  definition: string[];
  inQScoring: string[];
  formula?: { display: string; explanation?: string };
  related?: string[];
};

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: "composite-score",
    title: "Composite Score",
    category: "qscore",
    short:
      "The 1–100 headline number that summarizes a stock's quantitative attractiveness across five factor categories.",
    definition: [
      "A composite score is a single number from 1 to 100 that aggregates how a stock looks on five different dimensions: how cheap it is, how fast it's growing, how strong its recent price action is, how profitable the underlying business is, and how risky the stock is. Higher is better.",
      "Most quant scoring systems combine multiple factors into one headline number for a simple reason: each factor on its own gives a one-dimensional view. A stock that looks cheap on a value basis might have falling earnings; a stock with strong momentum might be wildly overvalued. A composite forces those views to be reconciled into one verdict.",
      "The 1–100 range is convention, not magic. Internally the score is a weighted average of category scores, each of which is itself an average of underlying metric scores. The endpoints (1 and 100) represent stocks roughly three standard deviations from the sector average on every metric.",
    ],
    inQScoring: [
      "QScoring computes two composites and averages them. The long-term composite weights fundamentals (Value 30% / Growth 20% / Profitability 25% / Momentum 5% / Risk 20%); the short-term composite weights the technical side (Momentum 40% / Risk 25% / Growth 15% / Value 10% / Profitability 10%). The headline QScore is the average of the two — see the [combining section](/methodology#combining) for the full weight table.",
    ],
    related: ["signal", "confidence", "z-score-normalization"],
  },
  {
    slug: "signal",
    title: "Signal",
    category: "qscore",
    short:
      "The directional verdict — Buy Long-Term, Buy Short-Term, Hold, or Short — derived from the composite scores.",
    definition: [
      "A signal is a discrete label applied to a stock based on its quantitative scores. Where the composite score is a 1–100 number, the signal is one of four strings — Buy Long-Term, Buy Short-Term, Hold, or Short — that maps the score onto a directional verdict.",
      "Signals exist because raw scores are useful for ranking but not for action. Telling someone \"this stock scored 73\" requires them to know what 73 means. Telling them \"Buy Long-Term, with high confidence\" answers the question they actually have.",
      "That said, a signal is not a recommendation. It's a structured opinion produced by a fixed model with no awareness of the user's portfolio, tax situation, or risk profile.",
    ],
    inQScoring: [
      "The signal is derived from the long-term and short-term composites with a fixed rule set, evaluated in order. A Short signal triggers if either composite falls below 30. Buy Short-Term triggers when the short-term score is at least 65 and the [momentum factor](/glossary/momentum-factor) is at least 60. Buy Long-Term triggers when the long-term score is at least 70 — or above 60 and higher than the short-term score. Anything else is Hold. The full ordered rule list lives in the [signals section](/methodology#signals) of the methodology.",
    ],
    related: ["composite-score", "momentum-factor", "confidence"],
  },
  {
    slug: "confidence",
    title: "Confidence",
    category: "qscore",
    short:
      "A High / Medium / Low rating that captures how complete the input data is and how decisive the score is.",
    definition: [
      "Confidence is a label that tells you how much weight to put on a quant score for a given stock. Two scores with the same composite number can mean very different things: a 75 computed from complete data on a well-covered stock is much more meaningful than a 75 with 40% of the underlying metrics missing.",
      "In statistics, this distinction is the difference between a point estimate and the variance around that estimate. A confidence label is a deliberately simple way to communicate the same idea without forcing readers to read error bars.",
    ],
    inQScoring: [
      "QScoring rates each stock's score as High, Medium, or Low confidence. High requires data completeness of at least 85% AND a decisive composite (≥70 or ≤30). Medium requires completeness of at least 75% but the score sits in the indecisive 30–70 range. Low means completeness is below 60%, or some category had so little data that it couldn't be evaluated. The full table is in the [confidence section](/methodology#confidence).",
    ],
    related: ["composite-score", "signal"],
  },
  {
    slug: "value-factor",
    title: "Value Factor",
    category: "qscore",
    short:
      "How cheap a stock looks relative to its fundamentals — earnings, book value, sales, EBITDA.",
    definition: [
      "The value factor is a measurement of how much the market is paying for a company per dollar of underlying business — earnings, book value, sales, or operating cash flow. Lower multiples mean the stock is cheaper relative to fundamentals, which historically correlates with higher long-run returns.",
      "The factor traces back to Benjamin Graham and David Dodd's Security Analysis (1934), the founding text of value investing. It was later formalized in the academic literature as the HML (High-Minus-Low book-to-market) factor in Fama and French's three-factor model (1993), which showed that cheap stocks outperformed expensive stocks by a statistically significant margin over multi-decade periods.",
      "Common value metrics include the [price-to-earnings ratio](/glossary/pe-ratio) (P/E), price-to-book (P/B), price-to-sales (P/S), and enterprise-value-to-EBITDA (EV/EBITDA). Each captures the same underlying intuition — what does this dollar of stock buy you in business fundamentals — through a different lens.",
    ],
    inQScoring: [
      "QScoring's value category averages four metrics: P/E (TTM), P/B, P/S, and EV/EBITDA. Each is z-scored against the stock's sector with the sign inverted (lower raw multiple → higher score). Negative values from loss-making companies or distressed book values get a fixed low score rather than being thrown out. The [value section of the methodology](/methodology#factor-value) documents the known weaknesses, especially around buyback-driven book-value distortions.",
    ],
    related: ["pe-ratio", "growth-factor", "z-score-normalization"],
  },
  {
    slug: "growth-factor",
    title: "Growth Factor",
    category: "qscore",
    short:
      "How quickly the underlying business is getting bigger and more profitable per share.",
    definition: [
      "The growth factor measures how fast a company's fundamentals are expanding — typically year-over-year growth in revenue, earnings per share (EPS), and free cash flow. Higher growth, all else equal, means more business to value.",
      "Where the [value factor](/glossary/value-factor) asks \"how much am I paying for what's already there,\" the growth factor asks \"how fast is what's already there getting bigger.\" The two are often (but not always) in tension — cheap stocks tend to grow more slowly, fast-growing stocks tend to be expensive.",
      "Growth and value together form most of the traditional fundamental analysis stack. A scoring system that ignored either would be missing half the picture.",
    ],
    inQScoring: [
      "QScoring uses three growth metrics: revenue growth, EPS growth, and free-cash-flow growth, all year-over-year on the most recent annual filing. Each is z-scored against the sector — a 10% growth rate means something different in Energy than in Software, and the score reflects that. See the [growth section](/methodology#factor-growth) for the lag caveats inherent in annual figures.",
    ],
    related: ["value-factor", "profitability-factor"],
  },
  {
    slug: "momentum-factor",
    title: "Momentum Factor",
    category: "qscore",
    short:
      "Recent price-based signals — has this stock been outperforming, and is the trend healthy?",
    definition: [
      "The momentum factor captures the empirical observation that stocks which have outperformed recently tend to keep outperforming over horizons of 3 to 12 months. Stocks that have underperformed tend to keep underperforming. The effect is one of the most replicated findings in academic finance.",
      "The original work is Jegadeesh and Titman (1993), \"Returns to Buying Winners and Selling Losers.\" It was later folded into Carhart's four-factor model (1997) as WML (Winners-Minus-Losers), an extension of the Fama–French model. Momentum was a sharp departure from the older view that price history shouldn't predict future returns.",
      "Momentum is typically measured with trailing returns (12-month, 6-month, 3-month, 1-month) and technical indicators like [RSI](/glossary/rsi) and moving-average crossovers. The intuition is that price is information — it reflects all the slow-moving investor flow, news digestion, and earnings revisions that cumulative returns capture.",
    ],
    inQScoring: [
      "QScoring's momentum category combines five inputs: 12-month total return, 3-month return, 1-month return, RSI(14), and the 50-day vs 200-day moving-average position (a binary golden-cross / death-cross). Returns are z-scored against sector; RSI uses a fixed non-monotonic curve so that both oversold-rebound and healthy-momentum regimes score well. See the [momentum section](/methodology#factor-momentum) for the well-known regime-turn weakness.",
    ],
    related: ["rsi", "signal", "risk-factor"],
  },
  {
    slug: "profitability-factor",
    title: "Profitability Factor",
    category: "qscore",
    short:
      "How efficiently the business converts capital into profit and cash.",
    definition: [
      "Profitability is the factor that asks how much profit the business actually generates per dollar of capital invested. A company can be cheap, growing, and well-positioned, but if it can't convert revenue into operating income or cash, none of those properties translate into shareholder value.",
      "The profitability factor was formalized as RMW (Robust-Minus-Weak operating profitability) in Fama and French's five-factor model (2015), which extended the original three-factor model after consistent evidence that profitable firms outperformed unprofitable firms even after controlling for value and size.",
      "Common profitability metrics include return on equity (ROE), return on assets (ROA), gross margin, operating margin, net margin, and free-cash-flow yield.",
    ],
    inQScoring: [
      "The profitability category averages six metrics: ROE (TTM), ROA (TTM), gross margin, operating margin, net margin, and FCF yield. All are z-scored within sector, since margin levels vary enormously across industries — a 30% gross margin is unremarkable in software but excellent in retail. See the [profitability section](/methodology#factor-profitability) for the buyback-driven ROE caveat.",
    ],
    related: ["growth-factor", "value-factor"],
  },
  {
    slug: "risk-factor",
    title: "Risk Factor",
    category: "qscore",
    short:
      "How much the stock moves with the market and how much it moves on its own.",
    definition: [
      "The risk factor captures the volatility of a stock's returns — both how much it co-moves with the broader market ([beta](/glossary/beta)) and how much it moves day-to-day on its own (realized volatility).",
      "Lower volatility is empirically associated with higher risk-adjusted returns. This is the \"low-volatility anomaly\" — the finding, against the predictions of CAPM, that low-volatility stocks have produced higher returns per unit of risk than high-volatility stocks. Frazzini and Pedersen's \"Betting Against Beta\" (2014) is one of the canonical papers.",
      "Risk in a quant scoring context is usually backward-looking — a stock's beta and volatility are computed from the past 1–5 years of returns. That makes it a coarse proxy for future risk, especially through regime changes.",
    ],
    inQScoring: [
      "QScoring's risk category uses two inputs: beta to the S&P 500 (closer to 1.0 scores higher) and 60-day annualized realized volatility (lower scores higher, z-scored within sector). Beta is reported by the data provider and computed against ~5 years of history. See the [risk section](/methodology#factor-risk) for the regime-change weakness.",
    ],
    related: ["beta", "sharpe-ratio", "momentum-factor"],
  },
  {
    slug: "z-score-normalization",
    title: "Z-Score Normalization",
    category: "qscore",
    short:
      "A statistical transformation that converts raw metrics to a comparable scale by measuring distance from the average in standard deviations.",
    definition: [
      "A z-score is the number of standard deviations a value sits above or below the mean of a reference distribution. A z-score of zero is exactly average; +1 is one standard deviation above average; -2 is two standard deviations below.",
      "Z-scoring is essential when combining metrics with different units. You cannot meaningfully average a [P/E ratio](/glossary/pe-ratio) (typically 5–40) with a year-over-year revenue growth percentage (typically -20% to +60%) — the units are incompatible. Z-scoring puts both onto the same dimensionless scale before any combination happens.",
      "The transformation is also robust to outliers when paired with winsorization (capping extreme values at, say, the 5th and 95th percentile before computing the mean and standard deviation). Without that, a single distressed company with a P/E of 500 can pull the reference mean enough to distort scores for everyone else.",
    ],
    formula: {
      display: "z = (x − μ) / σ",
      explanation:
        "x is the raw value, μ is the mean of the reference distribution, σ is the standard deviation.",
    },
    inQScoring: [
      "Every metric in the QScore is z-scored against the distribution of that same metric across the stock's sector. The z-score is then mapped linearly to a 0–100 score (z=0 → 50, z=±3 → 100/0). Reference statistics are winsorized at the 5th and 95th percentile so a single outlier can't skew the distribution. For metrics where lower is better (P/E, volatility), the sign is inverted before mapping. See the [combining section](/methodology#combining) for the full pipeline.",
    ],
    related: ["sector-normalization", "composite-score"],
  },
  {
    slug: "sector-normalization",
    title: "Sector Normalization",
    category: "qscore",
    short:
      "Comparing each stock to its sector peers rather than to the entire market — accounting for the fact that 'normal' looks different in each industry.",
    definition: [
      "Sector normalization is the practice of computing reference statistics (mean, standard deviation) within each sector, rather than across the whole market. A 30% gross margin is mediocre in software and excellent in retail; a P/E of 40 is high for a utility and unremarkable for a fast-growing tech company.",
      "Cross-sectional scoring without sector normalization tends to produce predictable artifacts: technology stocks dominate growth and profitability rankings, energy and financials dominate value rankings, utilities dominate risk rankings. The output ends up being more a sector classification than a stock pick.",
      "Sector-normalized scoring puts each stock head-to-head with peers facing roughly similar economic dynamics. The trade-off is that the best stock in a weak sector can score the same as the best stock in a strong sector — sector tilts have to be made elsewhere.",
    ],
    inQScoring: [
      "QScoring [z-scores](/glossary/z-score-normalization) each metric against the distribution of that metric across the stock's sector. If the sector has fewer than 15 covered names, the system falls back to the full universe of US large-caps. The reference universe is currently US-listed stocks above $15B market cap. See the [combining section](/methodology#combining) and the [limitations](/methodology#limitations) for known coverage gaps.",
    ],
    related: ["z-score-normalization", "composite-score"],
  },
  {
    slug: "pe-ratio",
    title: "P/E Ratio",
    category: "quant",
    short:
      "Price divided by earnings per share — what the market is paying for each dollar of profit.",
    definition: [
      "The price-to-earnings ratio (P/E) is the most widely-cited valuation multiple in finance. It takes the stock price and divides by trailing-twelve-month earnings per share. A P/E of 20 means the stock is priced at 20 times its annual earnings.",
      "A low P/E typically signals that the market expects slow growth or sees risk; a high P/E typically signals that the market expects fast growth or sees premium quality. Neither is automatically good or bad. A \"cheap\" P/E for a declining business can be a value trap; a \"rich\" P/E for a high-growth dominant business can be entirely justified.",
      "TTM P/E uses the trailing twelve months of earnings — backward-looking. Forward P/E uses analyst estimates — forward-looking but subject to estimate optimism bias. Cyclically-adjusted P/E (CAPE, or Shiller P/E) averages earnings over ten years to smooth out business-cycle noise.",
    ],
    formula: {
      display: "P/E = Price ÷ Earnings per share",
    },
    inQScoring: [
      "P/E (TTM) is one of four metrics in the QScoring [value category](/glossary/value-factor). Stocks with negative earnings get a fixed low score, since negative P/E is mathematically meaningful but practically unhelpful as a value signal. Everything else is z-scored against the sector with the sign inverted, so a low P/E maps to a high score. See the [value section](/methodology#factor-value) of the methodology.",
    ],
    related: ["value-factor", "growth-factor"],
  },
  {
    slug: "rsi",
    title: "RSI (Relative Strength Index)",
    category: "quant",
    short:
      "A 0–100 oscillator that flags when a stock is overbought or oversold, computed from recent gains vs losses.",
    definition: [
      "RSI was developed by J. Welles Wilder Jr. in 1978 (New Concepts in Technical Trading Systems). It's a bounded oscillator that ranges from 0 to 100 and measures the magnitude of recent gains relative to recent losses over a lookback window — usually 14 trading days.",
      "The conventional reading is that RSI above 70 indicates the stock is overbought (a pullback may be coming), while RSI below 30 indicates oversold (a rebound may be coming). Both thresholds are heuristics, not rules; strong trends can hold RSI above 70 or below 30 for weeks.",
      "RSI matters in quant scoring because it captures something different than raw trailing return. A stock can be up 30% over twelve months on smooth steady gains (healthy) or on a vertical late-stage spike (overbought). Trailing return alone treats both the same; RSI separates them.",
    ],
    formula: {
      display: "RSI = 100 − 100 ÷ (1 + RS),  where RS = avg gain ÷ avg loss over N days",
      explanation:
        "Default lookback is N = 14 trading days. avg gain and avg loss are computed as exponential moving averages of up-days and down-days respectively.",
    },
    inQScoring: [
      "The [momentum category](/glossary/momentum-factor) includes RSI(14) as one of five inputs. Unlike the trailing-return metrics, RSI uses a non-monotonic scoring curve: low RSI scores well (oversold rebound potential), mid-high RSI also scores well (healthy momentum), but extreme high RSI scores down (overbought risk). See the [momentum section](/methodology#factor-momentum).",
    ],
    related: ["momentum-factor", "signal"],
  },
  {
    slug: "beta",
    title: "Beta",
    category: "quant",
    short:
      "How much a stock's price moves relative to the overall market — high beta means amplified market moves.",
    definition: [
      "Beta is the slope of the regression line between a stock's returns and the market's returns. A beta of 1.0 means the stock moves one-for-one with the market — when the S&P 500 rises 1%, the stock tends to rise 1%. A beta of 1.5 amplifies market moves; a beta of 0.5 dampens them.",
      "Beta originated in the Capital Asset Pricing Model (Sharpe, 1964; Lintner, 1965) as the measure of systematic risk — the part of a stock's risk that can't be diversified away. CAPM predicted that high-beta stocks should earn higher returns. Empirically, the prediction has not held up well: high-beta stocks have generally not delivered on the promised excess return, which is part of why the low-volatility anomaly exists.",
      "Beta is backward-looking, computed from historical price data (typically 3–5 years of monthly or weekly returns). That makes it noisy at regime turns — a tech megacap's beta during 2010–2019 says little about its beta during a 2022 rate-hiking cycle.",
    ],
    formula: {
      display: "β = Cov(stock returns, market returns) ÷ Var(market returns)",
    },
    inQScoring: [
      "Beta is one of two inputs to the QScoring [risk category](/glossary/risk-factor). Stocks with a beta closer to 1.0 score higher; very high or very low betas score lower. The data provider computes beta against ~5 years of price history. See the [risk section](/methodology#factor-risk).",
    ],
    related: ["risk-factor", "sharpe-ratio"],
  },
  {
    slug: "sharpe-ratio",
    title: "Sharpe Ratio",
    category: "quant",
    short:
      "Excess return divided by volatility — how much extra return a strategy delivers per unit of risk.",
    definition: [
      "The Sharpe ratio measures how much return a portfolio or strategy generates above the risk-free rate, per unit of volatility. It's the single most common measure of risk-adjusted return in finance.",
      "Developed by William Sharpe in 1966 (originally as the \"reward-to-variability ratio\"). A Sharpe ratio of 1.0 means the strategy earns one percentage point of excess return for every percentage point of volatility — historically, that's roughly the long-run market average. A Sharpe of 2.0 is good; above 3.0 typically indicates either a genuinely strong strategy, an artifact (look-ahead bias, survivorship bias), or both.",
      "Sharpe is widely used but has known weaknesses: it treats upside and downside volatility symmetrically (the Sortino ratio fixes this by penalizing only downside), and it's sensitive to the distribution assumption — a strategy with rare large losses can show a high Sharpe right up until the tail event lands.",
    ],
    formula: {
      display: "Sharpe = (Strategy return − Risk-free rate) ÷ Strategy volatility",
    },
    inQScoring: [
      "Sharpe ratio isn't a per-stock metric, so it doesn't enter the QScore directly. Where it matters is validation: QScoring's [validation section](/methodology#validation) commits to publishing a long-short quintile-spread Sharpe ratio of at least 1.5 before subscription billing turns on. Until that bar is cleared, the QScore is described as a methodology, not a strategy with demonstrated risk-adjusted return.",
    ],
    related: ["risk-factor", "beta", "information-coefficient"],
  },
  {
    slug: "information-coefficient",
    title: "Information Coefficient",
    category: "quant",
    short:
      "The rank correlation between predicted scores and forward returns — how well a quant signal predicts the future.",
    definition: [
      "The information coefficient (IC) is the Spearman rank correlation between a signal's predicted ranking of stocks and their actual forward returns over a chosen horizon. An IC of 0 means the signal is no better than random; an IC of 1.0 would mean perfect ranking; an IC of -1.0 would mean inverted-perfect ranking.",
      "In practice, robust quant signals produce ICs in the 0.02–0.10 range. That sounds tiny, but it adds up: an IC of 0.05 sustained across thousands of stocks and hundreds of rebalances produces meaningful aggregate alpha.",
      "The IC matters because it isolates predictive power from execution. A signal can have a high IC but generate poor returns if implemented with high turnover or in capacity-constrained names; conversely, a signal with mediocre IC can produce good returns if it's implemented cheaply at scale.",
    ],
    inQScoring: [
      "IC is part of QScoring's [public validation commitment](/methodology#validation). Before subscription billing turns on, the methodology page will publish IC values for the QScore against 1-month, 3-month, 6-month, and 12-month forward returns, plus a rolling-window IC analysis to show stability over time. As of today the IC has not been published; the QScore is presented as a transparent synthesis of well-known factor research, not as a validated predictive signal.",
    ],
    related: ["composite-score", "sharpe-ratio"],
  },
];

export const GLOSSARY_BY_SLUG: Record<string, GlossaryTerm> = Object.fromEntries(
  GLOSSARY.map((t) => [t.slug, t])
);

export function getRelatedTerms(term: GlossaryTerm): GlossaryTerm[] {
  if (!term.related) return [];
  return term.related
    .map((slug) => GLOSSARY_BY_SLUG[slug])
    .filter((t): t is GlossaryTerm => Boolean(t));
}
