import Link from "next/link";
import { captionLabel, captionStyle, figureStyle, imgStyle } from "./styles";

const base = "/blog/predicting-loan-defaults";

export default function PredictingLoanDefaultsBody() {
  return (
    <>
      <p>
        The credit-risk dataset we covered in{" "}
        <Link href="/blog/how-credit-scoring-models-actually-work">our last post</Link> was
        generous. Loan grades that ran from 10% defaults at Grade A to 98% at Grade G.
        Loan-to-income ratios with a sharp cliff at 30%. A logistic regression got to AUC
        0.871. Reading that post, you&apos;d be forgiven for thinking credit scoring is a
        solved problem.
      </p>
      <p>This post is about what happens when the dataset isn&apos;t generous.</p>
      <p>
        We pulled the{" "}
        <a
          href="https://www.kaggle.com/datasets/hemanthsai7/loandefault"
          target="_blank"
          rel="noopener noreferrer"
        >
          hemanthsai7/loandefault
        </a>{" "}
        Kaggle dataset — 67,463 anonymized loan applications, 35 features per loan, a
        real-world <strong>9.25% default rate</strong>. Then we trained the two standard
        credit scoring models: <strong>logistic regression</strong> (the model class bank
        regulators are most comfortable with) and <strong>random forest</strong> (the model
        class data scientists reach for when they want non-linear interactions).
      </p>
      <div className="metric-list-inline">
        <strong>Headline:</strong> 67,463 loans · 9.25% default rate · best ROC AUC achieved
        was <strong>0.527</strong> (random forest), barely above the 0.5 random baseline.
      </div>
      <p>Both models barely beat random. Here&apos;s why — and what the right lesson is.</p>

      <h2>1. The headline features are flat</h2>
      <p>
        If you visit any lender&apos;s FAQ page, you&apos;ll see the same four risk signals
        advertised: <em>loan grade</em>, <em>home ownership</em>, <em>verification status</em>,
        and <em>interest rate</em>. The implication is that these are how the bank decides
        whether you&apos;re a good risk.
      </p>
      <p>In this dataset, they aren&apos;t.</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/loan_flat_features.png`}
          alt="Three-panel bar chart showing default rate by loan grade, home ownership, and verification status — all hovering near the 9.25% overall baseline"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 1.</strong> Default rate by loan grade, home
          ownership, and verification status. The dashed line is the overall 9.25% default
          rate. Grade A defaults at 8.7%; Grade G defaults at 10.6%. That&apos;s a{" "}
          <strong style={captionLabel}>1.9 percentage point</strong> spread across what is
          supposed to be the lender&apos;s most discriminating risk tier.
        </figcaption>
      </figure>
      <p>
        For comparison: the{" "}
        <Link href="/blog/how-credit-scoring-models-actually-work">
          previous credit-risk dataset
        </Link>{" "}
        showed an <strong>88 percentage point</strong> spread between Grade A and Grade G.
        Here it&apos;s 1.9. The grade variable in this dataset is essentially noise — it has
        the column heading of a risk signal but none of the discrimination.
      </p>
      <p>
        Home ownership tells the same story: mortgage holders default at 8.9%, outright
        owners at 10.2%, renters at 9.6%. Verification status is even flatter: not verified
        (9.2%), source verified (9.3%), verified (9.1%). None of these are signals;
        they&apos;re table dressings.
      </p>
      <p>Interest rate is the most striking of the four:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/loan_rate_overlap.png`}
          alt="Two overlapping density curves of interest rates for repaid vs defaulted loans — the curves are nearly identical"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 2.</strong> Interest rate distributions for
          repaid vs defaulted loans. Mean for repaid: 11.84%. Mean for defaulted: 11.88%.
          The lender priced both groups identically. Either the original underwriting model
          treated all of these applications the same way, or the rate is set by factors
          uncorrelated with the default outcome.
        </figcaption>
      </figure>
      <p>Either way, interest rate cannot help a downstream model predict default in this dataset.</p>

      <h2>2. Where signal does live — and it&apos;s thin</h2>
      <p>
        If the headline features don&apos;t carry signal, what does? Two columns:{" "}
        <code>Public Record</code> and <code>Delinquency - two years</code>. Both are
        negative-history flags — incidents the borrower has already accumulated before this
        loan was originated.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/loan_signal_features.png`}
          alt="Two bar charts: default rate by number of public records and by number of 2-year delinquencies, both showing rising default rates with more flags"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 3.</strong> The features that do separate
          borrowers — but only weakly. Borrowers with 3+ public records default at 12.4% vs
          9.2% for those with none. Borrowers with 4+ recent delinquencies default at 12.7%
          vs 9.2%. Real signal, but the populations are tiny: the 4+ delinquency bucket has
          only 577 borrowers out of 67,463.
        </figcaption>
      </figure>
      <p>
        The maximum absolute Pearson correlation between any individual feature and the
        default outcome is <strong>0.011</strong>. For comparison, a feature would need a
        correlation of ~0.05+ to be considered weakly informative in most credit modeling
        contexts. Every feature in this dataset is below the &ldquo;weakly informative&rdquo;
        line.
      </p>
      <div className="metric-list-inline">
        <strong>Why this matters.</strong> Real production scorecards from FICO,
        VantageScore, and the major bureaus use features this dataset doesn&apos;t have:
        trade-line credit utilization, hard-inquiry velocity, payment recency on each
        tradeline, balance trajectory, and total debt burden across all existing obligations.
        Those features routinely show correlations of 0.15–0.30 with default. The dataset
        we&apos;re using simply doesn&apos;t include them. What &ldquo;banks miss&rdquo; — for
        the banks that use thin feature sets like this one — is the feature set itself.
      </div>

      <h2>3. Logistic regression vs. random forest</h2>
      <p>
        The conventional wisdom on credit modeling: start with logistic regression because
        regulators understand it, then move to random forest or gradient boosting if you
        need to capture non-linear feature interactions. Random forests, the story goes, can
        wring extra signal from interactions a linear model misses.
      </p>
      <p>
        To test this, we trained both on the same 50,597-row train split (75%) and evaluated
        on the same 16,866-row test split (25%). To keep the comparison apples-to-apples in
        the face of 9.25% class imbalance, we tuned each model&apos;s probability threshold
        so that each one flags exactly the bottom 9.25% as predicted defaults — the same
        &ldquo;lender risk appetite&rdquo; for both.
      </p>
      <p>Results:</p>
      <div className="metric-list-inline">
        <strong>LR → RF:</strong> AUC 0.520 → 0.527 · recall 9.8% → 9.9% · precision 9.8% →
        9.9% · F1 0.098 → 0.099. The random baseline AUC is 0.500.
      </div>
      <p>
        Both models are <strong>barely above the random-coin-flip baseline.</strong> The
        random forest&apos;s extra capacity bought us 0.7 AUC points. At the operating
        threshold, that translates to one additional default caught out of every ~1,500
        loans flagged.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/loan_model_comparison.png`}
          alt="Grouped bar chart comparing AUC, precision, recall, and F1 for logistic regression vs random forest — both models close, both modest"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 4.</strong> Side-by-side metric comparison.
          Random forest edges out logistic regression on every metric, but the margins are
          within statistical noise. The story isn&apos;t &ldquo;RF wins&rdquo; — it&apos;s
          &ldquo;neither model can rescue a weak feature set.&rdquo;
        </figcaption>
      </figure>
      <figure style={figureStyle}>
        <img
          src={`${base}/loan_roc_overlay.png`}
          alt="ROC curves for logistic regression and random forest — both lines hug the diagonal baseline closely"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 5.</strong> ROC curves. A perfect classifier
          hugs the upper-left corner; a random classifier hugs the diagonal. Both models hug
          the diagonal. The random forest&apos;s curve is fractionally above the LR curve,
          which is fractionally above random.
        </figcaption>
      </figure>
      <p>
        This is what AUC 0.52 looks like. It&apos;s not zero signal — both models are
        statistically above the 0.5 baseline — but it&apos;s the kind of signal you&apos;d
        want to verify with a much larger sample before betting any actual capital on it.
      </p>

      <h2>4. The confusion matrices tell the operational story</h2>
      <p>
        AUC summarizes the model&apos;s ranking quality. The confusion matrix shows what
        happens when you actually use the model to make decisions. At the prevalence-matched
        threshold, here&apos;s how each model performs on the 16,866-loan test set:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/loan_confusion_matrices.png`}
          alt="Two confusion matrices side by side — logistic regression and random forest both showing very similar predicted-default counts and similar true-positive vs false-positive ratios"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 6.</strong> Confusion matrices at each
          model&apos;s tuned threshold (each model flags ~9.25% of test loans as predicted
          defaults). LR catches 153 actual defaults out of 1,560 (recall 9.8%) at the cost
          of 1,408 false positives. RF catches 154 (recall 9.9%) at the cost of 1,407 false
          positives. The two matrices are essentially identical.
        </figcaption>
      </figure>
      <p>
        To put that in business terms: for every 100 loans the model flags as risky, only
        about 10 will actually default. The other 90 would have repaid if approved.
        That&apos;s a <strong>10% precision</strong> — barely above the 9.25% you&apos;d get
        by flagging loans at random.
      </p>
      <p>
        A lender deploying this model into production wouldn&apos;t see meaningfully lower
        losses. They&apos;d just reject more good borrowers.
      </p>

      <h2>5. What the random forest &ldquo;found&rdquo;</h2>
      <p>
        Even when the model performs poorly, its feature importance distribution tells us
        something. If the random forest had found a small handful of strong predictors,
        we&apos;d see a sharp drop-off in the importance ranking. If it found no predictors
        at all, every feature would contribute roughly equally.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/loan_feature_importance.png`}
          alt="Horizontal bar chart of top 14 random forest feature importances — values are tightly clustered between 0.045 and 0.060, with no dominant feature"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 7.</strong> Random forest feature importance,
          top 14. The top feature (<code>Loan Amount</code>) has importance 0.056. The 14th
          feature has importance 0.034. That&apos;s a remarkably flat distribution — exactly
          what you&apos;d expect when the model is grasping at marginal signal across many
          weak features rather than relying on a few strong ones.
        </figcaption>
      </figure>
      <p>
        The visible features in the top of the ranking — Loan Amount, Home Value Reported,
        Total Received Late Fee, Interest Rate, Revolving Utilities, Funded Amount Investor
        — are mostly continuous variables. The model is treating them as a high-dimensional
        ranking problem rather than finding categorical &ldquo;buckets&rdquo; of high-risk
        borrowers, because no such buckets exist in this dataset.
      </p>
      <p>
        That&apos;s the diagnostic. A random forest with a flat importance distribution and
        a sub-0.55 AUC is telling you: <em>the answer isn&apos;t in this data.</em>
      </p>

      <h2>6. The right lesson</h2>
      <p>
        It would be easy to read this post as a takedown of random forests, or of logistic
        regression, or of credit scoring in general. None of those are the right read.
      </p>
      <p>
        The right read is:{" "}
        <strong>data quality and feature selection beat model choice. Every single time.</strong>
      </p>
      <ul>
        <li>
          <strong>If the features carry signal,</strong> as in the credit-risk dataset, even
          logistic regression — the oldest, simplest classifier in the toolkit — gets to AUC
          0.87.
        </li>
        <li>
          <strong>If the features don&apos;t carry signal,</strong> as in this loan-default
          dataset, even random forest — a non-linear ensemble with hundreds of trees —
          barely beats random guessing.
        </li>
      </ul>
      <p>
        Switching algorithms is the cheapest thing in a modeling project. It costs an hour
        of compute and a one-line code change. Adding a genuinely informative feature can
        take weeks of data engineering, vendor negotiation, or new data collection. So when
        teams ship a weak model and reach for a fancier algorithm before reaching for better
        features, they&apos;re optimizing the wrong axis.
      </p>

      <h2>7. Why this matters for an equity investor</h2>
      <p>QScoring isn&apos;t a credit bureau. We score equities. But the modeling discipline rhymes:</p>
      <ul>
        <li>
          <strong>Equity factor research</strong> spent decades arguing about whether the
          value, size, momentum, profitability, and investment factors are real, robust, and
          persistent. The factor zoo problem (Cochrane&apos;s &ldquo;hundreds of significant
          factors discovered&rdquo;) is the equity-research equivalent of an overfit model
          finding spurious signal in noise.
        </li>
        <li>
          <strong>Single-stock scoring</strong> needs features that historically separate
          winners from losers — measured by their information coefficient against forward
          returns, not their statistical fit in an in-sample regression.
        </li>
        <li>
          <strong>Feature engineering</strong> matters more than algorithm choice. QScoring
          uses a deliberately small, vetted feature set drawn from the academic factor
          literature, scored consistently across the universe. Adding a deep-learning ranker
          on top of weak features would be exactly the mistake this post is warning against.
        </li>
      </ul>
      <p>
        Browse the <Link href="/methodology">methodology page</Link> to see which features
        we use and how they&apos;re combined, or look at any individual ticker&apos;s{" "}
        <Link href="/score">live score</Link> to see the factor breakdown — including each
        factor&apos;s contribution and the underlying metric values.
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/how-credit-scoring-models-actually-work">
            How credit scoring models actually work
          </Link>{" "}
          — the previous post, with a dataset where the features actually carry signal
        </li>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> — the
          five-factor walkthrough on the equity side
        </li>
        <li>
          <Link href="/blog/sharpe-ratio-explained">Sharpe ratio explained</Link> — what
          good signal actually looks like when properly risk-adjusted
        </li>
        <li>
          <Link href="/methodology">Methodology</Link> — the full QScore construction
          disclosure
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
          <code>analysis/loan_default_prediction.py</code>), charts, and pinned dependencies
        </li>
      </ul>
    </>
  );
}
