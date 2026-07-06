import Link from "next/link";

type FactorTone = "green" | "amber" | "red";

type Factor = {
  key: string;
  label: string;
  score: number;
  tone: FactorTone;
  // Headline shown under the number, e.g. "Strong" / "Average" / "Weak".
  band: string;
  // Plain-English explanation of what the score means and which direction is good.
  blurb: string;
};

// Illustrative numbers — match the methodology bands so the copy doesn't drift
// from the real model.
const COMPOSITE = 74;
const FACTORS: Factor[] = [
  {
    key: "value",
    label: "Value",
    score: 72,
    tone: "green",
    band: "Cheap vs peers",
    blurb:
      "How inexpensive the stock looks vs sector peers on P/E, P/B, P/S, EV/EBITDA and free-cash-flow yield. Higher is cheaper. 70+ is meaningfully undervalued; under 30 looks expensive.",
  },
  {
    key: "growth",
    label: "Growth",
    score: 85,
    tone: "green",
    band: "Top-quartile growth",
    blurb:
      "Revenue and earnings growth ranked against the sector. Higher is faster-growing. 70+ is a top-quartile grower; under 30 is flat or shrinking.",
  },
  {
    key: "momentum",
    label: "Momentum",
    score: 66,
    tone: "amber",
    band: "Mild uptrend",
    blurb:
      "Price-trend strength across 1, 3, 6 and 12-month windows. Higher is a stronger trend. 70+ is a clear uptrend; under 30 is in a downtrend.",
  },
  {
    key: "profitability",
    label: "Profitability",
    score: 91,
    tone: "green",
    band: "Highly profitable",
    blurb:
      "Margins and capital efficiency — ROE, ROIC, gross margin. Higher is more profitable. 70+ is highly profitable; under 30 is structurally unprofitable.",
  },
  {
    key: "risk",
    label: "Risk",
    score: 38,
    tone: "red",
    band: "Riskier than peers",
    blurb:
      "Higher is SAFER. Combines realized volatility and beta vs the sector. 70+ is below-average risk; 38 means meaningfully more volatile than the typical peer.",
  },
];

const RING_CIRC = 283; // 2πr for r=45
function ringOffset(score: number) {
  return RING_CIRC - (Math.max(0, Math.min(100, score)) / 100) * RING_CIRC;
}

function toneStroke(tone: FactorTone) {
  return tone === "green"
    ? "var(--accent)"
    : tone === "amber"
      ? "var(--amber)"
      : "var(--red)";
}

function FactorCard({ factor }: { factor: Factor }) {
  const stroke = toneStroke(factor.tone);
  const tipId = `ff-tip-${factor.key}`;
  return (
    <div
      className={`ff-card tone-${factor.tone}`}
      tabIndex={0}
      role="group"
      aria-describedby={tipId}
    >
      <div className="ff-ring">
        <svg viewBox="0 0 100 100" width="72" height="72" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={ringOffset(factor.score)}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span className="ff-ring-number" style={{ color: stroke }}>
          {factor.score}
        </span>
      </div>
      <div className="ff-label">{factor.label}</div>
      <div className="ff-band">{factor.band}</div>

      <span role="tooltip" id={tipId} className="ff-tooltip">
        <strong>
          {factor.label} {factor.score}
        </strong>
        <br />
        {factor.blurb}
      </span>
    </div>
  );
}

export default function FiveFactorsSection() {
  return (
    <section className="five-factors" aria-labelledby="ff-heading">
      <h2 id="ff-heading">Five factors. One clear signal.</h2>
      <p className="ff-sub">
        Value, growth, momentum, profitability, and risk — synthesized into a single
        composite score so you get signal, not noise. Hover any tile to see what the
        number means.
      </p>

      <div className="ff-layout">
        {/* COMPOSITE */}
        <div
          className="ff-composite"
          tabIndex={0}
          role="group"
          aria-describedby="ff-tip-composite"
        >
          <div className="ff-eyebrow">Composite QScore</div>
          <div className="ff-composite-ring">
            <svg viewBox="0 0 120 120" width="160" height="160" aria-hidden>
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="6"
              />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 54}
                strokeDashoffset={2 * Math.PI * 54 - (COMPOSITE / 100) * 2 * Math.PI * 54}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <span className="ff-composite-number">{COMPOSITE}</span>
          </div>
          <div className="ff-composite-signal">Buy Long-Term</div>
          <div className="ff-composite-horizons">
            Long-Term <strong>78</strong>
            <span className="dot-sep">·</span>
            Short-Term <strong>71</strong>
          </div>
          <div className="ff-composite-meta">Illustrative sample</div>

          <span role="tooltip" id="ff-tip-composite" className="ff-tooltip ff-tooltip-composite">
            <strong>Composite QScore {COMPOSITE}</strong>
            <br />
            The weighted blend of all five factors on a 1–100 scale. Roughly: 70+ leans
            bullish, 40–69 is neutral, under 40 leans bearish. The two horizons re-weight
            the same factors — Long-Term emphasizes fundamentals, Short-Term tilts toward
            momentum and risk.
          </span>
        </div>

        {/* FACTOR GRID */}
        <div className="ff-grid">
          {FACTORS.map((f) => (
            <FactorCard key={f.key} factor={f} />
          ))}
          <Link href="/methodology" className="ff-card ff-card-link" aria-label="Read full methodology">
            <span className="ff-link-eyebrow">Read the</span>
            <span className="ff-link-title">Full methodology →</span>
            <span className="ff-link-sub">
              Every threshold, weight, and rule that drives these scores.
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
