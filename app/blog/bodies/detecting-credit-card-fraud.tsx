import Link from "next/link";
import type { CSSProperties } from "react";

const figureStyle: CSSProperties = { margin: "32px 0" };
const imgStyle: CSSProperties = {
  width: "100%",
  height: "auto",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  display: "block",
};
const captionStyle: CSSProperties = {
  marginTop: 12,
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  lineHeight: 1.55,
};
const captionLabel: CSSProperties = { color: "var(--text-dim)" };
const base = "/blog/detecting-credit-card-fraud";

export default function DetectingCreditCardFraudBody() {
  return (
    <>
      <p>
        Every introductory machine-learning class teaches accuracy and ROC AUC as the
        headline metrics for binary classification. Most of those classes also use balanced
        datasets where those metrics work reasonably well — cancer/no-cancer split 50/50,
        churn/no-churn split 30/70, that kind of thing.
      </p>
      <p>
        Real-world fraud detection is not that. The fraud rate on this Kaggle dataset is{" "}
        <strong>0.173%</strong> — about one in 578 transactions. At that level of imbalance,
        the metric you choose decides whether your fraud team thinks the model is a success
        or a failure. We&apos;re going to show why.
      </p>
      <p>
        The data:{" "}
        <a
          href="https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud"
          target="_blank"
          rel="noopener noreferrer"
        >
          mlg-ulb/creditcardfraud
        </a>
        , a publicly available dataset of <strong>284,807 European cardholder transactions</strong>{" "}
        across a 48-hour window in September 2013. Of those, 492 are confirmed fraud. The
        features are anonymized — 28 of the 30 columns are PCA-transformed for privacy
        (labeled V1 through V28), with only <code>Time</code> and <code>Amount</code> kept
        in their original form.
      </p>
      <p>
        That&apos;s a more interesting setup than it sounds. We can&apos;t lean on the
        columns being &ldquo;income&rdquo; or &ldquo;loan grade.&rdquo; The model has to
        find signal in features it can&apos;t name. Which makes this a particularly clean
        test of where the signal actually lives — and which metric is reading it correctly.
      </p>
      <div className="metric-list-inline">
        <strong>Headline:</strong> 284,807 transactions · 0.173% fraud rate · best ROC AUC
        0.968 (LR) · best PR-AUC 0.824 (RF) · 87% of fraud caught by reviewing the top 1% of
        flagged transactions.
      </div>

      <h2>1. The class imbalance is what eats your metrics</h2>
      <figure style={figureStyle}>
        <img
          src={`${base}/fraud_class_imbalance.png`}
          alt="Stacked horizontal bar showing 284,315 legitimate transactions and only 492 fraud cases — fraud is barely visible"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 1.</strong> 284,315 legitimate transactions,
          492 fraud cases. If you predicted &ldquo;legitimate&rdquo; for every transaction
          in this dataset, you&apos;d be wrong 492 times out of 284,807 — an{" "}
          <strong style={captionLabel}>accuracy of 99.83%</strong>. That number sounds like a
          win. It catches zero fraud.
        </figcaption>
      </figure>
      <p>
        This is the imbalance trap. When the rare class is what matters, the metric you
        reach for first — overall accuracy — is dominated by the easy class. A model that
        simply predicts &ldquo;legitimate&rdquo; for every single transaction beats almost
        any naive predictor at &ldquo;accuracy.&rdquo; The number looks great. The customers
        losing money to fraud see no benefit.
      </p>
      <p>
        The same problem leaks into the next metric most teams reach for: ROC AUC.
        We&apos;ll get to that one in a minute.
      </p>

      <h2>2. Where the fraud actually lives</h2>
      <p>
        Before we train any models, two things from the raw data are worth flagging — both
        because they&apos;re counterintuitive and because they shape the modeling choices
        later.
      </p>
      <p>
        <strong>First, fraud has a time-of-day pattern.</strong> The dataset spans 48 hours,
        and if we treat transaction time modulo 24 hours as a rough &ldquo;hour of
        day,&rdquo; fraud rate isn&apos;t constant:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/fraud_by_hour.png`}
          alt="Bar chart of fraud rate by hour-of-day showing elevated rates between 2am and 6am"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 2.</strong> Fraud rate by hour-of-day. The
          overnight window (2am–6am local) shows rates up to 4&times; the overall baseline —
          when card-not-present fraud rings prefer to operate because human review queues
          are thinner and customers are asleep and slower to notice charges.
        </figcaption>
      </figure>
      <p>
        <strong>Second, fraud amounts are smaller than legitimate ones — at the median.</strong>{" "}
        This one surprises people:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/fraud_amount_distribution.png`}
          alt="Histogram of transaction amounts on log scale showing fraud distribution skewed toward smaller amounts compared to legitimate transactions"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 3.</strong> Transaction amount distribution
          (log-x scale). Median legitimate transaction:{" "}
          <strong style={captionLabel}>$22.00</strong>. Median fraud transaction:{" "}
          <strong style={captionLabel}>$9.25</strong>. The intuition that &ldquo;fraud is
          big-ticket purchases&rdquo; is wrong on this dataset — the most common fraud
          pattern is small-dollar card-testing transactions where the attacker validates
          that a stolen card works before attempting larger charges.
        </figcaption>
      </figure>
      <p>
        The mean tells a different story (fraud mean is $122 vs $88 for legit — a few huge
        fraud transactions pull the average up), which is why looking at distributions
        matters. Means lie under fat tails. So do single-threshold &ldquo;flag if amount
        &gt; X&rdquo; rules.
      </p>

      <h2>3. Training two models</h2>
      <p>
        Same two model families as our previous posts on{" "}
        <Link href="/blog/how-credit-scoring-models-actually-work">
          credit-risk modeling
        </Link>{" "}
        and <Link href="/blog/predicting-loan-defaults">loan default prediction</Link>:{" "}
        <strong>logistic regression</strong> (linear, regulator-friendly) and{" "}
        <strong>random forest</strong> (non-linear ensemble). Both trained with{" "}
        <code>class_weight=balanced</code> on a 70/30 stratified split. Test set: 85,443
        transactions, 148 of them fraud.
      </p>
      <p>The headline numbers:</p>
      <div className="metric-list-inline">
        <strong>ROC AUC:</strong> LR 0.968 / RF 0.949 · <strong>PR-AUC:</strong> LR 0.705
        / RF 0.824 · <strong>Precision @ 0.5:</strong> LR 6.7% / RF 96.5% ·{" "}
        <strong>Recall @ 0.5:</strong> LR 87.8% / RF 73.6%
      </div>
      <p>
        Read those carefully. The two models are doing <em>very different things</em>, and
        the headline summary metric you pick decides which one looks better.
      </p>

      <h2>4. ROC AUC vs. PR-AUC — the chart that explains everything</h2>
      <p>The single most important plot in this post:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/fraud_roc_vs_pr.png`}
          alt="Two panels: ROC curves on the left showing both models near top-left corner, PR curves on the right showing the random forest meaningfully higher than logistic regression"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 4.</strong> Same two models, two metrics.{" "}
          <strong style={captionLabel}>Left (ROC):</strong> both curves hug the upper-left
          corner. LR&apos;s AUC is 0.968, RF&apos;s is 0.949 — LR looks <em>better</em>.{" "}
          <strong style={captionLabel}>Right (PR):</strong> RF clearly dominates.
          RF&apos;s PR-AUC is 0.824 vs LR&apos;s 0.705. Different stories, same models,
          same data.
        </figcaption>
      </figure>
      <p>This is the lesson. The two AUC metrics disagree because they answer different questions:</p>
      <ul>
        <li>
          <strong>ROC AUC</strong> asks: &ldquo;for a randomly chosen fraud and a randomly
          chosen non-fraud, how often does the model rank the fraud higher?&rdquo; The
          answer is dominated by the model&apos;s behavior on the easy 99.83% of legitimate
          transactions. Both models get easy negatives right; the score barely sees their
          disagreement on the hard positives.
        </li>
        <li>
          <strong>PR-AUC</strong> asks: &ldquo;as you walk down the model&apos;s ranking
          from most-suspicious to least, how well does precision hold up?&rdquo; This is
          dominated entirely by behavior on the 0.17% of positives — which is the actual
          operating region for a fraud team.
        </li>
      </ul>
      <p>
        At extreme class imbalance, ROC AUC saturates near 1.0 for any model that gets the
        easy stuff right. The difference between &ldquo;0.95 ROC AUC&rdquo; and &ldquo;0.97
        ROC AUC&rdquo; sounds tiny but can hide a 2&times; difference in how many false
        alarms your analysts wade through to find the same number of real frauds.
      </p>
      <div className="metric-list-inline">
        <strong>Rule of thumb.</strong> If the positive class is below ~5% of your data —
        fraud, rare disease screening, ad clicks, churn at sub-monthly intervals — make
        PR-AUC your headline metric. ROC AUC stays in the deck as a sanity check, but the
        optimization target should be PR-AUC or a directly operational quantity like
        recall-at-fixed-FPR or precision-at-top-K.
      </div>

      <h2>5. The threshold matters more than the algorithm</h2>
      <p>
        Both models output a probability between 0 and 1. The default is to flag anything
        above 0.5 as fraud. With class imbalance this severe, that&apos;s rarely the right
        cutoff.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/fraud_confusion_matrices.png`}
          alt="Two confusion matrices for random forest: at threshold 0.5 showing high precision and lower recall, at top-0.5% threshold showing more captured frauds but more false positives"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 5.</strong> Same random forest, two
          thresholds. <strong style={captionLabel}>Left (default 0.5):</strong> precision
          is 96.5%, recall is 73.6% — only 41 false alarms in 85,443 transactions, but 39
          actual frauds missed.{" "}
          <strong style={captionLabel}>Right (top-0.5% threshold):</strong> precision drops
          to 29.4%, but recall rises to 85.1% — the model now catches 126 of 148 frauds at
          the cost of 302 false positives the analysts will review.
        </figcaption>
      </figure>
      <p>
        Which one is &ldquo;better&rdquo; depends entirely on the fraud team&apos;s
        operational budget. If they can review 300 transactions per day, the top-0.5%
        threshold catches more fraud. If they can only review 50 per day, the
        high-precision threshold is the right cut. The model didn&apos;t change — only the
        operating point did.
      </p>

      <h2>6. The operational view: cumulative gains</h2>
      <p>
        For a fraud team, the metric they actually care about is roughly: <em>if I have
        capacity to review the top X% of flagged transactions, what fraction of fraud will
        I catch?</em> That&apos;s a <strong>cumulative gains curve</strong>:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/fraud_cumulative_gains.png`}
          alt="Cumulative gains curve showing that reviewing the top 1% of transactions ranked by random forest risk catches ~87% of fraud"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 6.</strong> Cumulative gains. Reviewing the
          top 1% of model-flagged transactions catches{" "}
          <strong style={captionLabel}>87% of fraud with the random forest</strong> and
          86% with logistic regression. By 5%, both models are over 90%. The diagonal is
          what you&apos;d get reviewing transactions at random.
        </figcaption>
      </figure>
      <p>
        This is the chart you want in front of a fraud-ops director. &ldquo;Give me a
        budget to review 1% of transactions and I&apos;ll catch 87% of your fraud&rdquo; is
        a defensible business case. &ldquo;My model has 0.96 ROC AUC&rdquo; is not.
      </p>

      <h2>7. What the random forest found in anonymized features</h2>
      <p>
        Even though V1–V28 are PCA components and have no human-readable names, the random
        forest&apos;s importance ranking tells us how concentrated the fraud signal is
        across them:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/fraud_feature_importance.png`}
          alt="Horizontal bar chart of top 12 random forest feature importances showing V17, V14, V12, V10 dominating with importance over 0.10 each"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 7.</strong> Random forest feature importance,
          top 12. Unlike the{" "}
          <Link href="/blog/predicting-loan-defaults">loan-default dataset</Link> where
          importance was uniformly distributed across 30 weak features, here a handful of
          PCA components — V17, V14, V12, V10 — carry most of the signal. The fraud
          features were anonymized, but they&apos;re anonymized in a way that preserves
          enough variance for the model to discriminate.
        </figcaption>
      </figure>
      <p>
        This is what &ldquo;a model is finding something&rdquo; looks like in
        feature-importance terms: a few features doing most of the work, with a long tail
        of marginal contributors. Compare that to our{" "}
        <Link href="/blog/predicting-loan-defaults">loan-default post</Link>, where the
        top feature&apos;s importance was barely above the bottom feature&apos;s — that was
        the signature of a model grasping at noise.
      </p>

      <h2>8. What this means for equity scoring</h2>
      <p>
        QScoring scores equities, not fraud, but the metric-choice question rhymes.
        Single-stock scoring is also an imbalanced ranking problem: the genuine breakouts
        and breakdowns over the next quarter are the rare events; most stocks drift along
        sector-and-market beta. The wrong evaluation metric makes everything look like
        it&apos;s working.
      </p>
      <ul>
        <li>
          <strong>Headline R² against forward returns</strong> is the equity-research
          equivalent of accuracy. It&apos;s dominated by the boring middle, where most
          stocks live. A score with high R² can still miss the rare moves that actually pay.
        </li>
        <li>
          <strong>Information coefficient (IC)</strong>, the Spearman correlation between
          score and forward return, is partway better — it&apos;s rank-based, so the middle
          dominates less.
        </li>
        <li>
          <strong>Top-decile vs bottom-decile spread</strong>, sometimes called the
          quintile spread, is the operational metric. &ldquo;If I buy the stocks the score
          ranks in the top 10% and short the bottom 10%, what&apos;s the annualized return
          spread?&rdquo; That&apos;s the equity equivalent of <em>precision-at-top-K</em>.
          It&apos;s what we publish on the <Link href="/methodology">methodology page</Link>{" "}
          and what we&apos;d argue is the only metric worth reading from any equity score.
        </li>
      </ul>
      <p>
        If you only remember one thing from this post:{" "}
        <strong>the metric you optimize is the metric you get. Choose accordingly.</strong>
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/how-credit-scoring-models-actually-work">
            How credit scoring models actually work
          </Link>{" "}
          — first post in the series, on a dataset where the features carry strong signal
        </li>
        <li>
          <Link href="/blog/predicting-loan-defaults">Predicting loan defaults</Link> —
          second post, on a dataset where neither LR nor RF can find much signal at all
        </li>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> — the
          five-factor walkthrough on the equity side
        </li>
        <li>
          <Link href="/methodology">Methodology</Link> — the full QScore construction
          disclosure, with IC and quintile-spread metrics
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
          <code>analysis/credit_card_fraud_detection.py</code>), charts, and pinned
          dependencies
        </li>
      </ul>
    </>
  );
}
