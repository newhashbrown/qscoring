import Link from "next/link";
import { fmp } from "@/lib/scoring/fmp";
import { maxDrawdown, downsideDeviation, returnsCorrelation } from "@/lib/scoring/risk-stats";
import { summarizeInsider, type InsiderSummary } from "@/lib/scoring/insider";

const SPX = "^GSPC";

function pct(fraction: number | null, signed = false, digits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  const v = fraction * 100;
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}
function corr(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "—" : v.toFixed(2);
}
function usdCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function RiskBlock({
  drawdown,
  downside,
  spxCorr,
}: {
  drawdown: number | null;
  downside: number | null;
  spxCorr: number | null;
}) {
  return (
    <div className="as-block">
      <div className="as-row"><span className="as-label">Deeper risk (1-year)</span></div>
      <div className="qh-grid">
        <div className="qh-screen">
          <span className="qh-screen-label">Max drawdown</span>
          <span className="qh-screen-value tone-bearish">{drawdown === null ? "—" : `-${(drawdown * 100).toFixed(1)}%`}</span>
        </div>
        <div className="qh-screen">
          <span className="qh-screen-label">Downside deviation (ann.)</span>
          <span className="qh-screen-value">{pct(downside)}</span>
        </div>
        <div className="qh-screen">
          <span className="qh-screen-label">S&amp;P 500 correlation</span>
          <span className="qh-screen-value">{corr(spxCorr)}</span>
        </div>
      </div>
    </div>
  );
}

function PositioningBlock({ insider }: { insider: InsiderSummary | null }) {
  return (
    <div className="as-block">
      <div className="as-row">
        <span className="as-label">Positioning</span>
        {insider && (
          // Only net BUYING is a notable signal — routine selling (comp,
          // diversification, 10b5-1 plans) is the default for most large-caps,
          // so it stays neutral rather than painting nearly every page red.
          <span className={`as-value tone-${insider.direction === "net-buying" ? "bullish" : "neutral"}`}>
            Insiders {insider.direction === "net-buying" ? "net buying" : insider.direction === "net-selling" ? "net selling (routine)" : "balanced"}
          </span>
        )}
      </div>
      {insider ? (
        <p className="as-detail">
          Net insider <strong>{usdCompact(insider.netValue)}</strong> over {insider.windowDays} days
          ({insider.buyCount} open-market buys, {insider.sellCount} sells). Insider buying is the
          informative signal; routine selling is normal.
        </p>
      ) : (
        <p className="as-detail">No recent open-market insider transactions.</p>
      )}
      <p className="as-detail as-muted">
        Short interest, days-to-cover, and institutional-ownership change require a data-plan upgrade (not yet available).
      </p>
    </div>
  );
}

export default async function RiskPositioning({ ticker }: { ticker: string }) {
  const [stockR, spxR, insiderR] = await Promise.all([
    fmp.historical(ticker).catch(() => []),
    fmp.historical(SPX).catch(() => []),
    fmp.insiderTrading(ticker).catch(() => []),
  ]);

  const drawdown = maxDrawdown(stockR);
  const downside = downsideDeviation(stockR);
  const spxCorr = returnsCorrelation(stockR, spxR);
  const insider = summarizeInsider(insiderR);

  const hasRisk = drawdown !== null || downside !== null || spxCorr !== null;
  if (!hasRisk && !insider) return null;

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Tier 3</span>
        <span className="signal-title">Risk, Positioning &amp; Evidence</span>
      </summary>
      <div className="signal-body">
        {hasRisk && <RiskBlock drawdown={drawdown} downside={downside} spxCorr={spxCorr} />}
        <PositioningBlock insider={insider} />
        <div className="as-block">
          <Link href="/performance" className="evidence-link">
            See how QScore is validated against forward returns →
          </Link>
          <p className="as-detail as-muted">
            Forward-return IC, quintile spread &amp; hit rate publish on /performance as the
            tracking panel accrues enough no-look-ahead history.
          </p>
        </div>
      </div>
    </details>
  );
}

export function RiskPositioningSkeleton() {
  return (
    <section className="signal-section skeleton" aria-hidden="true">
      <div className="signal-summary-skel" />
    </section>
  );
}
