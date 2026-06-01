import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";

export const metadata = {
  title: "Pricing — QScoring",
  description:
    "Start free. Every QScore is free to see — Pro unlocks the full five-factor breakdown behind the number. $19.99/mo, cancel anytime, with a founding-member rate for early users.",
  alternates: { canonical: "https://qscoring.com/pricing" },
};

/* Thin-line icons (no icon dependency in the repo — inline SVG, matching ScoreView). */
function CheckIcon() {
  return (
    <svg
      className="pricing-check"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      className="pricing-dash"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

type Tier = {
  name: string;
  price: string;
  period: string;
  note: string;
  features: string[];
  cta: { label: string; href: string };
  variant: "outline" | "primary";
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    note: "No account required to start.",
    features: [
      "Composite QScore for any US ticker",
      "Buy / Hold / Short signal",
      "Price chart + insight drivers",
      "Watch up to 3 tickers",
    ],
    cta: { label: "Score a ticker", href: "/score" },
    variant: "outline",
  },
  {
    name: "Pro",
    price: "$19.99",
    period: "/mo",
    note: "Billed monthly · cancel anytime",
    features: [
      "Everything in Free",
      "Full five-factor breakdown — value, growth, momentum, profitability, risk",
      "Unlimited watchlist + email alerts on score changes",
      "Side-by-side compare",
      "Methodology deep-dives",
    ],
    cta: { label: "Start 7-day free trial", href: "/#signup" },
    variant: "primary",
    featured: true,
  },
  {
    name: "Founding",
    price: "$14.99",
    period: "/mo for life",
    note: "25% off the standard $19.99 — locked in for early members.",
    features: [
      "Everything in Pro",
      "Rate locked for life — never increases",
      "Early access to new factors + tools",
      "Direct line to the team for feedback",
    ],
    cta: { label: "Join the founding list", href: "/#signup" },
    variant: "outline",
  },
];

type CompareRow = { label: string; free: boolean | string; pro: boolean | string };

const COMPARE_ROWS: CompareRow[] = [
  { label: "Composite QScore", free: true, pro: true },
  { label: "Buy / Hold / Short signal", free: true, pro: true },
  { label: "Price chart + insight drivers", free: true, pro: true },
  { label: "Watchlist size", free: "3", pro: "Unlimited" },
  { label: "Five-factor breakdown", free: false, pro: true },
  { label: "Email score-change alerts", free: false, pro: true },
  { label: "Side-by-side compare", free: false, pro: true },
  { label: "Methodology deep-dives", free: false, pro: true },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What's included in the free trial?",
    a: "The 7-day Pro trial unlocks the full five-factor breakdown, unlimited watchlist, email alerts, and the compare tool for every ticker. No charge until the trial ends, and you can cancel any time before then.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Pro is billed monthly with no contract — cancel in one click and you keep access through the end of the billing period. The Free tier never expires.",
  },
  {
    q: "Where does the data come from?",
    a: "Scores are computed from fundamentals and price data sourced via Financial Modeling Prep and public company filings, normalized across the scored US-equity universe. See the methodology page for the full pipeline.",
  },
  {
    q: "Is this financial advice?",
    a: "No. QScoring is an educational quantitative scoring tool, not investment advice. Scores describe how a stock ranks on measurable factors — they are not a recommendation to buy or sell any security.",
  },
];

function CompareCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="mono compare-value">{value}</span>;
  }
  return value ? <CheckIcon /> : <DashIcon />;
}

export default function PricingPage() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav showSearch={false} />

      <main className="pricing">
        <header className="pricing-header">
          <p className="pricing-eyebrow">Pricing</p>
          <h1>Start free. Upgrade when the breakdown pays for itself.</h1>
          <p className="pricing-lede">
            Every QScore is free to see. Pro unlocks the five-factor breakdown behind the number.
          </p>
        </header>

        <section className="pricing-tiers" aria-label="Plans">
          <div className="pricing-grid">
            {TIERS.map((tier) => (
              <article
                key={tier.name}
                className={`pricing-card ${tier.featured ? "featured" : ""}`}
              >
                {tier.featured && <span className="pricing-pill mono">Most popular</span>}
                <p className="pricing-tier-name">{tier.name}</p>
                <p className="pricing-price">
                  <span className="mono amount">{tier.price}</span>
                  <span className="mono period">{tier.period}</span>
                </p>
                <p className="pricing-note">{tier.note}</p>
                <ul className="pricing-features">
                  {tier.features.map((f) => (
                    <li key={f}>
                      <CheckIcon />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta.href}
                  className={`pricing-btn ${tier.variant}`}
                >
                  {tier.cta.label}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="pricing-compare" aria-labelledby="compare-heading">
          <h2 id="compare-heading">Compare plans</h2>
          <div className="compare-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col" className="mono">Feature</th>
                  <th scope="col" className="mono">Free</th>
                  <th scope="col" className="mono">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td><CompareCell value={row.free} /></td>
                    <td><CompareCell value={row.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pricing-faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading">Frequently asked questions</h2>
          <div className="faq-list">
            {FAQ.map((item) => (
              <details key={item.q} className="faq-item">
                <summary>
                  <span>{item.q}</span>
                  <span className="faq-marker" aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="pricing-cta-band">
          <h2>See your first QScore free</h2>
          <p>No account, no card — just type a ticker.</p>
          <Link href="/score" className="pricing-btn primary">
            Search a ticker →
          </Link>
        </section>
      </main>

      <footer>
        <p className="disclaimer">
          QScoring is an educational quantitative scoring tool, not investment advice.
        </p>
        <p className="footer-links">
          <a href="/methodology">Methodology</a>
          <span className="sep">·</span>
          <a href="/score">Score a ticker</a>
          <span className="sep">·</span>
          <a href="/compare">Compare</a>
          <span className="sep">·</span>
          <a href="/glossary">Glossary</a>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
