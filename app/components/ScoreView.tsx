import Link from "next/link";
import type { CategoryName, CategoryScore, MetricScore, ScoreResult, Signal } from "@/lib/scoring";
import PriceChart from "./PriceChart";

const SIGNAL_LABEL: Record<Signal, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

const CATEGORY_GLOSSARY: Record<CategoryName, string> = {
  value: "/glossary/value-factor",
  growth: "/glossary/growth-factor",
  momentum: "/glossary/momentum-factor",
  profitability: "/glossary/profitability-factor",
  risk: "/glossary/risk-factor",
};

const SIGNAL_TONE: Record<Signal, "bullish" | "bearish" | "neutral"> = {
  BUY_LONG_TERM: "bullish",
  BUY_SHORT_TERM: "bullish",
  HOLD: "neutral",
  SHORT: "bearish",
};

function formatRaw(metric: MetricScore): string {
  if (metric.raw === null) return "—";
  if (metric.format === "percent") return `${(metric.raw * 100).toFixed(1)}%`;
  if (metric.format === "ratio") return metric.raw.toFixed(2);
  if (metric.name === "50/200 MA") return metric.raw === 1 ? "Bullish" : "Bearish";
  return metric.raw.toFixed(2);
}

function scoreColor(score: number | null): "green" | "amber" | "red" {
  if (score === null) return "amber";
  if (score >= 65) return "green";
  if (score >= 40) return "amber";
  return "red";
}

function ScoreRing({ value, size = 140 }: { value: number; size?: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="ring-container" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle className="ring-bg" cx="50" cy="50" r={radius} />
        <circle
          className="ring-fill"
          cx="50"
          cy="50"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            animation: "none",
          }}
        />
      </svg>
      <div className="ring-number" style={{ fontSize: size * 0.32 }}>
        {value}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryScore }) {
  return (
    <div className="category-card">
      <div className="category-header">
        <h3>
          <Link
            href={CATEGORY_GLOSSARY[category.name]}
            className="glossary-info-link"
            aria-label={`Learn more about the ${category.label} factor`}
          >
            {category.label}
          </Link>
        </h3>
        <div className="category-score">{Math.round(category.score)}</div>
      </div>
      <div className="metric-list">
        {category.metrics.map((m) => (
          <div key={m.name} className="metric-row">
            <span className="metric-name">{m.name}</span>
            <span className="metric-raw">{formatRaw(m)}</span>
            <div className="metric-track">
              <div
                className={`metric-fill ${scoreColor(m.score)}`}
                style={{ width: m.score === null ? "0%" : `${m.score}%` }}
              />
            </div>
            <span className="metric-score">{m.score === null ? "—" : Math.round(m.score)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScoreView({ data }: { data: ScoreResult }) {
  const tone = SIGNAL_TONE[data.signal];
  const changeUp = data.changePercent >= 0;

  return (
    <div className="score-page">
      <header className="score-header">
        <div className="score-id">
          <h1 className="score-ticker">
            {data.ticker} <span className="score-company">{data.companyName}</span>
          </h1>
          <div className="score-meta-row">
            {data.sector && <span className="tag">{data.sector}</span>}
            {data.industry && <span className="tag muted">{data.industry}</span>}
          </div>
        </div>
        <div className="score-price">
          <div className="price-value">${data.price.toFixed(2)}</div>
          <div className={`price-change ${changeUp ? "up" : "down"}`}>
            {changeUp ? "▲" : "▼"} {Math.abs(data.changePercent).toFixed(2)}%
          </div>
        </div>
      </header>

      <section className={`composite-panel tone-${tone}`}>
        <ScoreRing value={data.composite} />
        <div className="composite-meta">
          <div className="composite-label">
            QScore{" "}
            <Link href="/glossary/signal" className="glossary-info-link">
              Signal
            </Link>
          </div>
          <div className={`composite-signal tone-${tone}`}>{SIGNAL_LABEL[data.signal]}</div>
          <div className="composite-confidence">
            <Link href="/glossary/confidence" className="glossary-info-link">
              Confidence
            </Link>
            : {data.confidence}
          </div>
          <div className="composite-horizons">
            <div>
              <div className="horizon-label">Long-Term</div>
              <div className="horizon-value">{data.longTermScore}</div>
            </div>
            <div>
              <div className="horizon-label">Short-Term</div>
              <div className="horizon-value">{data.shortTermScore}</div>
            </div>
          </div>
        </div>
      </section>

      <PriceChart ticker={data.ticker} />

      <section className="category-grid">
        {data.categories.map((c) => (
          <CategoryCard key={c.name} category={c} />
        ))}
      </section>

      <p className="score-timestamp">
        Generated {new Date(data.generatedAt).toLocaleString()} ·{" "}
        <Link href="/methodology" className="method-link">
          How is this calculated?
        </Link>
      </p>
    </div>
  );
}
