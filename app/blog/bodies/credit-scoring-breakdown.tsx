import Link from "next/link";
import { captionLabel, captionStyle, figureStyle, imgStyle } from "./styles";

const base = "/blog/how-credit-scoring-models-actually-work";

export default function CreditScoringBreakdownBody() {
  return (
    <>
      <p>
        If you&apos;ve ever applied for a loan and been told &ldquo;your application is in
        review,&rdquo; you&apos;ve handed your data to a credit scoring model — almost
        certainly a flavor of logistic regression or gradient boosting wrapped in a UI. It
        looked at a handful of numbers about you and emitted a probability that you&apos;d
        repay. That probability is what got you approved, declined, or quietly bumped to a
        higher interest rate.
      </p>
      <p>
        The mechanics are not magic. They&apos;re also not the polished narrative that
        lenders publish on their FAQ pages. So instead of explaining what credit scoring
        models <em>say</em> they do, we trained one and looked at what it actually does. The
        modeling discipline is closely related to what we do for equities at QScoring — see{" "}
        <Link href="/blog/how-to-read-a-qscore">how to read a QScore</Link> for the parallel
        on the equity side.
      </p>
      <p>
        The data:{" "}
        <a
          href="https://www.kaggle.com/datasets/laotse/credit-risk-dataset"
          target="_blank"
          rel="noopener noreferrer"
        >
          Kaggle&apos;s <code>credit-risk-dataset</code>
        </a>
        , which contains 32,581 anonymized loan applications. After dropping a handful of
        clearly-bad rows (ages above 80, a few income outliers) and filling in missing values
        we were left with <strong>32,437 records</strong> — a meaningful sample with a
        real-world default rate of <strong>21.9%</strong>. That&apos;s higher than what major
        banks see because the dataset includes a chunk of subprime applicants, which is
        actually useful: we want a signal-rich population for modeling.
      </p>
      <div className="metric-list-inline">
        <strong>Headline numbers:</strong> 32,437 applications · 21.9% default rate · median
        income $55,000 · median loan $8,000 · median rate 11.0%.
      </div>
      <p>
        Here&apos;s what we found, ordered from weakest signal to strongest, ending with a
        working model.
      </p>

      <h2>1. The lender&apos;s own grade is the single best published predictor</h2>
      <p>
        Every loan in the dataset comes pre-tagged with a <code>loan_grade</code> from A
        (best) to G (worst), assigned by the originating lender&apos;s internal scoring
        system. It&apos;s tempting to treat grade as cheating — it&apos;s a model output, not
        a raw input. But it tells you something interesting: how good the lender&apos;s
        existing model is.
      </p>
      <p>Spoiler: very good. The default rate by grade looks like this:</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/default_by_grade.png`}
          alt="Bar chart showing default rate climbing from 10% for grade A loans to 98.4% for grade G loans"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 1.</strong> The default rate climbs from 10.0%
          for grade A to 98.4% for grade G. Roughly two-thirds of borrowers fall into the
          relatively safe A and B grades; the worst grades are small populations but
          spectacularly risky.
        </figcaption>
      </figure>
      <p>
        That&apos;s a <strong>9.9&times; lift</strong> in default rate between the
        lender&apos;s best and worst tier — and almost everything in the worst tier defaults.
        The takeaway isn&apos;t &ldquo;use someone else&apos;s score.&rdquo; It&apos;s that{" "}
        <em>some signal exists, and a model can find it</em>. The interesting question is how
        much of that signal you can recover from raw features, without using the grade.
        We&apos;ll come back to that when we train the model.
      </p>

      <h2>2. Where you live matters more than people admit</h2>
      <p>
        Lenders are not allowed to discriminate based on a long list of protected
        characteristics, and housing-related variables sit close to that line. But &ldquo;do
        you rent, own, or carry a mortgage&rdquo; is on the application, and the data is
        unambiguous:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/default_by_home.png`}
          alt="Horizontal bar chart: renters default at 31.6%, mortgage holders 12.6%, outright owners 7.5%"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 2.</strong> Renters default on loans at{" "}
          <strong style={captionLabel}>31.6%</strong> — about{" "}
          <strong style={captionLabel}>4.2&times;</strong> the rate of outright homeowners
          (7.5%) and 2.5&times; the rate of mortgage holders (12.6%).
        </figcaption>
      </figure>
      <p>
        The mortgage-holder effect is the interesting one. A mortgage payment is, by
        definition, a large recurring liability — naively, you&apos;d expect more defaults
        among mortgage holders, not fewer. The model picks up the inverse because{" "}
        <em>survivorship</em>: people who&apos;ve already qualified for a mortgage have
        already passed someone else&apos;s credit screen. The variable is a proxy for
        &ldquo;the financial system has previously vouched for this person.&rdquo;
      </p>
      <p>
        Renting, by contrast, is a near-universal state for younger applicants and
        lower-income workers. The variable doesn&apos;t punish renters — it captures
        everything that &ldquo;I rent&rdquo; tends to correlate with: less savings, less
        stable employment, less prior credit history. The lender doesn&apos;t care which of
        those is causal. The model doesn&apos;t care either.
      </p>

      <h2>3. Why you&apos;re borrowing matters more than how much</h2>
      <figure style={figureStyle}>
        <img
          src={`${base}/default_by_intent.png`}
          alt="Horizontal bar chart showing default rates by loan intent"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 3.</strong> Default rates range from{" "}
          <strong style={captionLabel}>14.9%</strong> on venture loans up to{" "}
          <strong style={captionLabel}>28.7%</strong> on debt consolidation loans. The intent
          label captures a lot of context the dollar amount can&apos;t.
        </figcaption>
      </figure>
      <p>
        &ldquo;What is the loan for?&rdquo; is a free-form question on most applications, but
        lenders bucket the answer. The buckets are predictive in a way that makes intuitive
        sense once you see it:
      </p>
      <ul>
        <li>
          <strong>Debt consolidation (28.7% default)</strong> — the borrower is already in
          distress. The new loan is a coping mechanism, not an investment.
        </li>
        <li>
          <strong>Medical (26.7%)</strong> — usually unplanned, often correlated with income
          disruption from illness.
        </li>
        <li>
          <strong>Home improvement (26.2%)</strong> — surprisingly risky. Many home-improvement
          loans go to financially-stretched homeowners deferring problems.
        </li>
        <li>
          <strong>Venture (14.9%)</strong> — the safest category. Counterintuitive, but the
          people who get approved for venture loans are heavily pre-screened.
        </li>
      </ul>
      <p>
        The cheap-and-cheerful signal isn&apos;t <em>how much</em> the borrower wants.
        It&apos;s <em>why</em>.
      </p>

      <h2>4. Income, by itself, is misleading</h2>
      <p>Income is the variable everyone <em>thinks</em> should be the most important one. It isn&apos;t.</p>
      <figure style={figureStyle}>
        <img
          src={`${base}/income_distribution.png`}
          alt="Two overlapping density curves of income for repaid vs defaulted loans showing significant overlap"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 4.</strong> Defaulters skew lower-income, but
          the distributions overlap heavily. Plenty of $40k-earners repay on time; plenty of
          $90k-earners default. Income alone is a weak predictor.
        </figcaption>
      </figure>
      <p>
        If you draw a line at the median income ($55,000) and predict &ldquo;everyone above
        repays, everyone below defaults,&rdquo; you&apos;d be wrong nearly half the time. The
        reason income looks important in lender narratives is that it appears in{" "}
        <em>combinations</em> — specifically, in the ratio of loan size to income, which is
        much more interesting.
      </p>

      <h2>5. Loan-to-income ratio is the single strongest raw signal</h2>
      <p>
        This is the signal that surprises people. The total loan amount doesn&apos;t matter
        much in isolation. Neither does income. But the ratio — the percentage of your annual
        income represented by the loan — separates good and bad loans almost as well as the
        lender&apos;s full grade does:
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/default_by_lti.png`}
          alt="Bar chart showing default rate increasing with loan-to-income ratio, from 10% under 5% to 78.6% above 50%"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 5.</strong> Loan-to-income ratio: under 5% of
          income, defaults run 10.2%. Once the loan exceeds 30% of annual income, default
          rates jump to <strong style={captionLabel}>69.7%</strong>. Above 50%, it&apos;s{" "}
          <strong style={captionLabel}>78.6%</strong>.
        </figcaption>
      </figure>
      <p>
        The discontinuity around 30% is striking. It&apos;s also financially intuitive: a
        loan worth 30%+ of annual income usually means the monthly payment is a non-trivial
        fraction of monthly take-home pay. Combined with rent, food, healthcare, and existing
        debt, that load is mathematically hard to carry. The model doesn&apos;t need to
        &ldquo;understand&rdquo; this; it just sees the historical data and weights the ratio
        heavily.
      </p>

      <h2>Building a working credit scoring model</h2>
      <p>With the patterns in hand, we trained a baseline model. The setup:</p>
      <ul>
        <li>
          <strong>Algorithm:</strong> Logistic regression with L2 regularization and balanced
          class weights. Boring on purpose — this is the model class regulators are most
          comfortable with, because every coefficient has a direct interpretation.
        </li>
        <li>
          <strong>Features:</strong> Age, income, employment length, loan amount, interest
          rate, loan-to-income ratio, credit history length, plus one-hot encoded categoricals
          (home ownership, loan intent, loan grade, prior default flag).
        </li>
        <li>
          <strong>Split:</strong> 75% train / 25% held-out test, stratified on the target.
        </li>
        <li>
          <strong>Threshold:</strong> 0.5 for binary classification (this is the lever lenders
          actually tune for portfolio risk).
        </li>
      </ul>
      <p>Results on the held-out 8,110 applications:</p>
      <div className="metric-list-inline">
        <strong>ROC AUC 0.871</strong> · accuracy 80.5% · recall 77.6% (defaults caught) ·
        precision 53.8%
      </div>
      <figure style={figureStyle}>
        <img
          src={`${base}/roc_curve.png`}
          alt="ROC curve well above the diagonal with AUC 0.871"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 6.</strong> The ROC curve sits well above the
          diagonal. AUC of 0.871 means: for any randomly-chosen defaulter and any
          randomly-chosen non-defaulter, the model assigns the defaulter a higher risk score
          87% of the time.
        </figcaption>
      </figure>
      <p>
        <strong>Recall of 77.6%</strong> means the model catches more than three-quarters of
        the people who will actually default. That&apos;s good.{" "}
        <strong>Precision of 53.8%</strong> means that of everyone the model <em>flags</em>{" "}
        as risky, about half actually default — the other half are false positives.
      </p>
      <p>
        This precision/recall tradeoff is the entire game in credit scoring. Tilt the
        threshold one way and you approve more good borrowers but eat more losses. Tilt it
        the other way and your loss rate drops but you reject creditworthy people. Every
        lender chooses where on that curve to operate, based on their cost of capital and
        their tolerance for charge-offs. The model doesn&apos;t make that choice; a product
        manager does.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/confusion_matrix.png`}
          alt="Confusion matrix: 5152 true negatives, 1184 false positives, 397 false negatives, 1377 true positives"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 7.</strong> Confusion matrix at the default
          threshold. The 1,184 false positives — borrowers flagged risky who would have
          repaid — are the lender&apos;s opportunity cost. The 397 false negatives are the
          actual losses.
        </figcaption>
      </figure>

      <h2>What the model actually weights</h2>
      <p>
        Because we used logistic regression on standardized features, the coefficients have a
        clean meaning: each one is the change in log-odds of default per one-standard-deviation
        move in that feature, holding the others constant. Positive coefficients raise the
        model&apos;s risk estimate; negative coefficients lower it.
      </p>
      <figure style={figureStyle}>
        <img
          src={`${base}/feature_importance.png`}
          alt="Bar chart of standardized logistic regression coefficients showing loan_percent_income as the biggest positive driver"
          style={imgStyle}
        />
        <figcaption style={captionStyle}>
          <strong style={captionLabel}>Figure 8.</strong> Standardized coefficients. Red
          raises risk; green lowers it. Loan-to-income ratio dominates everything else.
        </figcaption>
      </figure>
      <p>The top risk-raising features:</p>
      <ul>
        <li>
          <code>loan_percent_income</code> (+1.38) — by a wide margin, the strongest driver.
        </li>
        <li>
          <code>loan_grade_D</code> (+0.75) and <code>loan_grade_E</code> (+0.46) — being in a
          worse credit tier compounds risk.
        </li>
        <li>
          <code>person_home_ownership_RENT</code> (+0.34) — renting, after controlling for
          income and grade, still raises risk.
        </li>
      </ul>
      <p>The top risk-lowering features:</p>
      <ul>
        <li>
          <code>loan_amnt</code> (&minus;0.68) — interesting. Larger absolute loan amounts{" "}
          <em>reduce</em> predicted risk, holding everything else constant. The reason: bigger
          loans go to better-screened borrowers, and the ratio variable already absorbs the
          affordability signal.
        </li>
        <li>
          <code>person_home_ownership_OWN</code> (&minus;0.45) — outright ownership materially
          de-risks the application.
        </li>
        <li>
          <code>loan_intent_VENTURE</code> (&minus;0.38) and{" "}
          <code>loan_intent_EDUCATION</code> (&minus;0.24) — purpose matters, and the model
          agrees with the raw data.
        </li>
      </ul>

      <h2>The five rules that fall out of the data</h2>
      <p>
        If you wanted to summarize what a working credit model has learned — in language a
        borrower would actually understand — it comes down to five rules:
      </p>
      <ul>
        <li>
          <strong>The ratio matters, not the amount.</strong> A $20,000 loan against a $90,000
          income is safer than a $5,000 loan against a $15,000 income. Lenders care about what
          fraction of your year the loan represents.
        </li>
        <li>
          <strong>The lender&apos;s own grade is mostly right.</strong> If you&apos;ve been
          graded D or worse, the model is going to start from a position of skepticism — and
          the historical data agrees with that skepticism more often than not.
        </li>
        <li>
          <strong>Housing is a wealth proxy.</strong> Owning outright or carrying a mortgage
          signals that someone else has already vouched for your finances. The model treats it
          that way.
        </li>
        <li>
          <strong>Purpose is a tell.</strong> Loans for debt consolidation, medical bills, and
          home improvement default at meaningfully higher rates than loans for ventures or
          education. The reason isn&apos;t moral; it&apos;s that the purpose correlates with
          the borrower&apos;s current financial state.
        </li>
        <li>
          <strong>Income, in isolation, is noise.</strong> It only becomes a meaningful
          signal in combination with other variables — most importantly, the size of the loan.
        </li>
      </ul>

      <h2>The same discipline applied to stocks</h2>
      <p>
        QScoring isn&apos;t a credit bureau. We score equities, not borrowers. But the
        modeling discipline is the same one: take a noisy population (companies instead of
        applicants), extract a handful of features that actually predict the outcome you care
        about (forward returns instead of defaults), and resist the temptation to
        over-engineer.
      </p>
      <p>
        The lesson from credit scoring that we apply to equity scoring:{" "}
        <strong>
          simple linear models built on the right features beat complex models built on the
          wrong ones.
        </strong>{" "}
        The credit model above uses 11 features and a logistic regression and gets 87% AUC. A
        neural network on the same data, in our testing, gets to about 0.89 — marginally
        better, completely uninterpretable, and harder to defend in a regulated context.
      </p>
      <p>
        For equity scoring the same principle holds. We&apos;ve spent more time choosing the
        features than choosing the algorithm. If you&apos;re curious about which features we
        use and what their information coefficients look like, that&apos;s on the{" "}
        <Link href="/methodology">methodology page</Link> — with the same level of disclosure
        you just read above. Browse the <Link href="/score">live ticker scores</Link> to see
        the factor breakdown for any name in the universe.
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/how-to-read-a-qscore">How to read a QScore</Link> — the
          five-factor walkthrough on the equity side
        </li>
        <li>
          <Link href="/blog/sharpe-ratio-explained">Sharpe ratio explained</Link> — the
          risk-adjusted-return cousin of the precision/recall tradeoff
        </li>
        <li>
          <Link href="/glossary/value-factor">Value factor</Link> — sector-normalized scoring
          in the same family
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
          — full Python pipeline, charts, and pinned dependencies
        </li>
      </ul>
    </>
  );
}
