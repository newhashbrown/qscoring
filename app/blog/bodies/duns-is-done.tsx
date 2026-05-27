import Link from "next/link";

export default function DunsIsDoneBody() {
  return (
    <>
      <p>
        In April 2022, the U.S. General Services Administration quietly retired the DUNS
        number as the official identifier for entities doing business with the federal
        government. After more than fifty years as the de facto business ID for grants,
        contracts, and SAM.gov registration, the nine-digit number that Dun &amp;
        Bradstreet had built an empire around was replaced by a{" "}
        <strong>Unique Entity Identifier</strong> issued by the government itself — free,
        instant, no third-party gatekeeper.
      </p>
      <p>
        No press conference. No mourning. The biggest single validator of DUNS — the U.S.
        federal procurement system — just walked away.
      </p>
      <p>
        That should have ended the conversation about whether DUNS is the &ldquo;gold
        standard&rdquo; for business identity and creditworthiness. Somehow it hasn&apos;t.
      </p>

      <h2>The federal mic drop</h2>
      <p>
        For decades, the strongest argument for DUNS was that the federal government
        required it. Want a contract? Get a DUNS. Want a grant? Get a DUNS. The compliance
        moat <em>was</em> the moat.
      </p>
      <p>
        That moat is gone. SAM.gov now issues UEIs in minutes, for free, with no D&amp;B
        in the loop. If you don&apos;t need a DUNS for federal work, the honest question
        becomes: what <em>do</em> you need it for? In 2026, the answer is: less and less.
        A handful of legacy supplier portals still ask. Some banks request it. Some
        procurement teams default to it because the form has always asked. None of that
        is the same as a standard.
      </p>

      <h2>The pay-to-play problem</h2>
      <p>
        D&amp;B&apos;s business model has always had a tension at its core: it sells data{" "}
        <em>about</em> businesses, and it sells products <em>to</em> those same businesses
        to influence what that data says about them. CreditBuilder, CreditBuilder Plus,
        the premium tiers — subscription products that let a business add trade
        references, accelerate updates, and &ldquo;manage&rdquo; its own profile.
      </p>
      <p>
        In any other ratings industry this would be a scandal. Moody&apos;s doesn&apos;t
        sell issuers a subscription to upgrade their bond rating. S&amp;P doesn&apos;t
        take payment from the company being scored to expedite favorable trade lines. But
        in business credit, D&amp;B has run this playbook openly for years, and class
        action complaints alleging deceptive sales of these products have been a
        recurring feature of its history.
      </p>
      <p>
        When the scored party can pay the scorer to improve the score, the score is not a
        score. It&apos;s a marketing surface.
      </p>

      <h2>Stale by design</h2>
      <p>
        The other quiet problem with DUNS-anchored scoring is latency.{" "}
        <strong>PAYDEX</strong> — D&amp;B&apos;s flagship business credit score — is
        built from trade payment data submitted by vendors. That data flows in slowly,
        irregularly, and from a self-selected sample of suppliers. A business can be 60
        days late on three major obligations and still show a perfect PAYDEX for weeks,
        because the data hasn&apos;t landed yet. The reverse is also true: a single
        misreported invoice can sit on a profile for months before a dispute resolves.
      </p>
      <p>
        In a world where commercial bank feeds, accounting platforms, and payment rails
        surface receivable and payable data in near real time, anchoring a credit
        decision to monthly trade tape is a choice. It is not the obvious one.
      </p>

      <h2>The black box nobody can audit</h2>
      <p>
        Try to figure out exactly how a PAYDEX score moves. The methodology is published
        in broad strokes — payment days relative to terms, weighted by dollar amount —
        but the mechanics of which trade lines count, how they&apos;re weighted, how
        recently submitted data displaces older data, and how disputes propagate are
        opaque enough that an entire cottage industry of &ldquo;DUNS optimization&rdquo;
        consultants exists to interpret it for fee-paying customers.
      </p>
      <p>
        A credit signal that requires a paid consultant to explain it is not a public
        good. It&apos;s a product.
      </p>

      <h2>What&apos;s actually replacing it</h2>
      <p>
        The interesting thing about 2026 is not that DUNS is fading — it&apos;s what&apos;s
        taking its place. Lenders, factors, and credit insurers are increasingly
        underwriting on:
      </p>
      <ul>
        <li>
          <strong>Real-time bank transaction feeds</strong> — verified deposits, payment
          behavior, balance volatility
        </li>
        <li>
          <strong>Accounting platform integrations</strong> pulling AR/AP directly from
          QuickBooks, Xero, NetSuite
        </li>
        <li>
          <strong>Tax transcript and filing data</strong> from IRS-authorized providers
        </li>
        <li>
          <strong>Government-issued identifiers</strong> (UEI, EIN) tied to verified
          entity records — not paid profile management
        </li>
        <li>
          <strong>Alternative scoring models</strong> that combine these signals with
          sector-specific risk weights, the way{" "}
          <Link href="/blog/how-credit-scoring-models-actually-work">
            modern credit models actually work
          </Link>
        </li>
      </ul>
      <p>
        This is the same shift that hit consumer credit a decade ago, when cash flow
        underwriting and bank-linked verification started chipping away at the FICO
        monopoly. The institutional logic is identical: when better data exists and
        arrives faster, the legacy bureau is no longer the cheapest path to a good
        decision.
      </p>

      <h2>The eulogy</h2>
      <p>
        DUNS isn&apos;t going to vanish next quarter. It will linger the way fax machines
        linger in healthcare — embedded in old forms, demanded by old systems, kept alive
        by the inertia of compliance checkboxes nobody has rewritten. D&amp;B will keep
        selling subscriptions. Some portals will keep asking for the number.
      </p>
      <p>
        But &ldquo;gold standard&rdquo; is a present-tense claim. And the present tense
        is this: the federal government retired it, the methodology is gameable, the data
        is slow, and the scoring is sold back to the people being scored.
      </p>
      <p>
        That isn&apos;t a gold standard. That&apos;s a brand outliving its product.
      </p>

      <h2>Related reads</h2>
      <ul>
        <li>
          <Link href="/blog/how-credit-scoring-models-actually-work">
            How credit scoring models actually work
          </Link>{" "}
          — what a real model weights, with a working logistic regression on 32,437
          loan applications
        </li>
        <li>
          <Link href="/blog/predicting-loan-defaults">
            Predicting loan defaults
          </Link>{" "}
          — why data quality beats model choice, every time
        </li>
        <li>
          <Link href="/methodology">QScoring methodology</Link> — the same disclosure
          discipline applied to equities
        </li>
        <li>
          <Link href="/score">Score a ticker</Link> — see the factor breakdown live
        </li>
      </ul>
    </>
  );
}
