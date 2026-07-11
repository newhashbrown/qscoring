import Link from "next/link";
import {
  QSCORE_MODEL_VERSION,
  confidenceReason,
  type CategoryName,
  type CategoryScore,
  type CompanyHeader,
  type MetricScore,
  type ScoreResult,
  type Signal,
  type SizeBucket,
} from "@/lib/scoring";
import PriceChart from "./PriceChart";
import ScoreHistory from "./ScoreHistory";
import ScoreRing from "./ScoreRing";

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


const SIZE_BUCKET_LABEL: Record<SizeBucket, string> = {
  mega: "Mega Cap",
  large: "Large Cap",
  mid: "Mid Cap",
  small: "Small Cap",
  micro: "Micro Cap",
};

// Compact USD formatter: $4.28T / $50.0B / $812M / $1.2K. Returns "—" for null.
function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// Compact share-count formatter (no currency): 14.69B / 812M.
function formatSharesCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(0)}K`;
  return abs.toFixed(0);
}

function formatPercent(fraction: number | null, digits = 2): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

function format52Week(low: number | null, high: number | null): string {
  if (low === null || high === null) return "—";
  return `$${low.toFixed(2)} – $${high.toFixed(2)}`;
}

function SizeBadge({ bucket }: { bucket: SizeBucket | null }) {
  if (!bucket) return null;
  return (
    <span className={`tag size-badge size-${bucket}`} title={`${SIZE_BUCKET_LABEL[bucket]} by market capitalization`}>
      {SIZE_BUCKET_LABEL[bucket]}
    </span>
  );
}

function CompanyHeaderStrip({ header }: { header: CompanyHeader }) {
  // Free-float fraction shown alongside the absolute share count so a thin
  // float (large insider/locked holdings) is visible at a glance.
  const floatPct =
    header.freeFloatPercent !== null && Number.isFinite(header.freeFloatPercent)
      ? ` (${header.freeFloatPercent.toFixed(1)}%)`
      : "";

  const stats: Array<{ label: string; value: string; title?: string }> = [
    { label: "Market Cap", value: formatUsdCompact(header.marketCap) },
    { label: "Shares Out.", value: formatSharesCompact(header.sharesOutstanding) },
    { label: "Float", value: `${formatSharesCompact(header.floatShares)}${floatPct}` },
    {
      label: "Avg $ Vol (20d)",
      value: formatUsdCompact(header.avgDollarVolume20),
      title: "20-trading-day average of price × volume",
    },
    { label: "52-Wk Range", value: format52Week(header.week52Low, header.week52High) },
    { label: "Div Yield", value: formatPercent(header.dividendYield) },
  ];

  return (
    <section className="company-header-strip" aria-label="Company snapshot">
      {stats.map((s) => (
        <div key={s.label} className="chs-item" title={s.title}>
          <span className="chs-label">{s.label}</span>
          <span className="chs-value">{s.value}</span>
        </div>
      ))}
    </section>
  );
}

// Relative-context line (Phase 4): which reference the score used (sector vs
// universe), plus favorability-oriented percentile ranks ("ahead of X%") so a
// higher figure always reads as more favorable. The reference label shows
// immediately; the percentiles appear once the bundled universe-stats carries
// quantiles (and are omitted for non-monotonic metrics like Beta/RSI).
function MetricRelativeLine({ m }: { m: MetricScore }) {
  const r = m.relative;
  if (!r || !r.scoredAgainst) return null;
  const refLabel =
    r.scoredAgainst === "sector"
      ? `Sector-relative${r.sectorSize ? ` · ${r.sectorSize} peers` : ""}`
      : "Universe-wide";
  return (
    <div className="metric-relative">
      <span className="rel-ref" title="Which reference distribution this metric is scored against">
        {refLabel}
      </span>
      {r.sectorPercentile !== null && (
        <span className="rel-pct" title="Ranks ahead of this share of sector peers (higher is better)">
          ahead of {r.sectorPercentile}% of sector
        </span>
      )}
      {r.universePercentile !== null && (
        <span className="rel-pct rel-muted">ahead of {r.universePercentile}% of universe</span>
      )}
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
        {category.metrics.map((m) => {
          // Not meaningful for this industry (e.g. EV/EBITDA for a bank, model
          // v0.4): render "n/m" instead of a score/bar — it's excluded from the
          // category average, not a zero.
          const na = m.applicable === false;
          return (
            <div key={m.name} className="metric-item">
              <div className={`metric-row${na ? " metric-na" : ""}`}>
                <span className="metric-name">{m.name}</span>
                <span className="metric-raw" title={na ? "Not meaningful for this industry" : undefined}>
                  {na ? "n/m" : formatRaw(m)}
                </span>
                <div className="metric-track" aria-hidden="true">
                  {!na && (
                    <div
                      className={`metric-fill ${scoreColor(m.score)}`}
                      style={{ width: m.score === null ? "0%" : `${m.score}%` }}
                    />
                  )}
                </div>
                <span className="metric-score" title={na ? "Not meaningful for banks" : undefined}>
                  {na ? "n/m" : m.score === null ? "—" : Math.round(m.score)}
                </span>
              </div>
              {!na && <MetricRelativeLine m={m} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatGeneratedAt(iso: string): string {
  // ISO formatter pinned to UTC so SSR and CSR match. Same trick used for
  // the homepage carousel caption — switching to ET wall-clock would force
  // a suppressHydrationWarning hook because user/server tz can differ.
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${date}, ${time} UTC`;
}

export default function ScoreView({
  data,
  growthDetail,
}: {
  data: ScoreResult;
  // Tier 1b multi-year fundamentals block, rendered directly beneath the
  // five-factor grid (it expands on the Growth factor). Passed as a slot so
  // its async FMP fetch stays at the page level and this component stays sync.
  growthDetail?: React.ReactNode;
}) {
  const tone = SIGNAL_TONE[data.signal];
  const changeUp = data.changePercent >= 0;

  // Top driver computation: highest-scoring factor is the strongest piece
  // pulling the composite up; lowest is what's holding it back. Tie-break
  // by category name for stability.
  const sortedByScore = [...data.categories].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name)
  );
  const topPositive = sortedByScore[0];
  const topNegative = sortedByScore[sortedByScore.length - 1];

  const reason = confidenceReason(data.confidence, data.composite, data.categories);

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
            {data.header && <SizeBadge bucket={data.header.sizeBucket} />}
          </div>
        </div>
        <div className="score-price">
          <div className="price-value">${data.price.toFixed(2)}</div>
          <div className={`price-change ${changeUp ? "up" : "down"}`}>
            <span aria-hidden="true">{changeUp ? "▲" : "▼"}</span>
            <span className="visually-hidden">{changeUp ? "Up" : "Down"}</span>
            {" "}{Math.abs(data.changePercent).toFixed(2)}%
          </div>
        </div>
      </header>

      {data.header && <CompanyHeaderStrip header={data.header} />}

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

      <section className="score-insight" aria-label="Quick takeaway">
        <div className="insight-head">
          <span className="insight-eyebrow">What this says</span>
          <span className="insight-meta">
            QScore model {QSCORE_MODEL_VERSION} ·{" "}
            <span title="The QScore is computed live from current fundamentals each time this page is rendered — this is that compute time, not a fixed publication date. Very low-traffic tickers may serve a cached render until the next visit refreshes it.">
              Score computed {formatGeneratedAt(data.generatedAt)}
            </span>
            {data.staleSince ? (
              <>
                {" "}·{" "}
                <span
                  className="stale-pill"
                  title="One or more upstream data fetches failed and the last cached payload was used instead."
                >
                  Data as of {formatGeneratedAt(data.staleSince)}
                  <span className="visually-hidden"> (stale: one or more upstream data fetches failed; last cached payload shown)</span>
                </span>
              </>
            ) : null}
          </span>
        </div>

        <div className="insight-grid">
          <div className="insight-driver positive">
            <span className="insight-driver-label">Top positive driver</span>
            <Link
              href={CATEGORY_GLOSSARY[topPositive.name]}
              className="insight-driver-value"
            >
              <strong>{topPositive.label}</strong>
              <span className="insight-driver-score">{Math.round(topPositive.score)}/100</span>
            </Link>
          </div>
          <div className="insight-driver negative">
            <span className="insight-driver-label">Top negative driver</span>
            <Link
              href={CATEGORY_GLOSSARY[topNegative.name]}
              className="insight-driver-value"
            >
              <strong>{topNegative.label}</strong>
              <span className="insight-driver-score">{Math.round(topNegative.score)}/100</span>
            </Link>
          </div>
        </div>

        <p className="insight-confidence">
          <strong>{data.confidence} confidence:</strong> {reason}{" "}
          <Link href="/glossary/confidence" className="glossary-info-link">
            What does confidence mean?
          </Link>
        </p>
      </section>

      <ScoreHistory ticker={data.ticker} />

      <PriceChart ticker={data.ticker} />

      <section className="category-grid">
        {data.categories.map((c) => (
          <CategoryCard key={c.name} category={c} />
        ))}
      </section>

      {growthDetail}

      <section className="related-links" aria-label="Related pages">
        <span className="related-eyebrow">Related</span>
        <Link href="/compare">Compare {data.ticker} to another ticker →</Link>
        <Link href="/scores">Browse stocks by category →</Link>
        <Link href="/methodology">Read the full methodology →</Link>
        <Link href="/glossary">Glossary of factors and metrics →</Link>
      </section>

    </div>
  );
}
