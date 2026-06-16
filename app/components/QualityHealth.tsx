import { fmp } from "@/lib/scoring/fmp";
import {
  qualityScreens,
  shareholderYield,
  type QualityScreens,
  type ShareholderYield,
} from "@/lib/scoring/quality";

type Tone = "bullish" | "bearish" | "neutral";

function pct(fraction: number | null, digits = 2): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}
function ratio(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}×`;
}

const BAND_TONE: Record<string, Tone> = {
  strong: "bullish", adequate: "bullish", safe: "bullish", "net-cash": "bullish", low: "bullish",
  moderate: "neutral", grey: "neutral", "n/a": "neutral",
  weak: "bearish", distress: "bearish", high: "bearish",
};

function Screen({ label, value, band }: { label: string; value: string; band: string | null }) {
  const tone = band ? BAND_TONE[band] ?? "neutral" : "neutral";
  return (
    <div className="qh-screen">
      <span className="qh-screen-label">{label}</span>
      <span className="qh-screen-value">{value}</span>
      {band && <span className={`qh-band tone-${tone}`}>{band}</span>}
    </div>
  );
}

function QualityGrid({ q }: { q: QualityScreens }) {
  return (
    <div className="as-block">
      <div className="as-row"><span className="as-label">Quality &amp; health screens</span></div>
      <div className="qh-grid">
        <Screen label="Piotroski F" value={q.piotroski === null ? "—" : `${q.piotroski}/9`} band={q.piotroskiBand} />
        <Screen label="Altman Z" value={q.altmanZ === null ? "—" : q.altmanZ.toFixed(1)} band={q.altmanZone} />
        <Screen label="Net Debt / EBITDA" value={ratio(q.netDebtToEbitda)} band={q.leverageBand} />
        <Screen
          label="Interest Coverage"
          value={q.coverageBand === "n/a" ? "n/a" : ratio(q.interestCoverage)}
          band={q.coverageBand}
        />
      </div>
    </div>
  );
}

function YieldBlock({ y }: { y: ShareholderYield }) {
  const buybackTone: Tone = y.buybackYield === null ? "neutral" : y.buybackYield >= 0 ? "bullish" : "bearish";
  return (
    <div className="as-block">
      <div className="as-row">
        <span className="as-label">Total shareholder yield</span>
        <span className="as-value"><strong>{pct(y.totalYield)}</strong></span>
      </div>
      <div className="qh-yield">
        <span>Dividend <strong>{pct(y.dividendYield)}</strong></span>
        <span className={`tone-${buybackTone}`}>
          Buyback <strong>{y.buybackYield !== null && y.buybackYield >= 0 ? "+" : ""}{pct(y.buybackYield)}</strong>
        </span>
      </div>
      <p className="as-detail">Net buyback (repurchases less issuance) ÷ market cap, plus trailing dividend yield.</p>
    </div>
  );
}

export default async function QualityHealth({ ticker }: { ticker: string }) {
  const [scoresR, kmR, ratiosR, cashR, profileR] = await Promise.all([
    fmp.financialScores(ticker).catch(() => []),
    fmp.keyMetricsTtm(ticker).catch(() => []),
    fmp.ratiosTtm(ticker).catch(() => []),
    fmp.cashFlowStatement(ticker, 1).catch(() => []),
    fmp.profile(ticker).catch(() => []),
  ]);

  const q = qualityScreens(scoresR[0], kmR[0], ratiosR[0]);
  const y = shareholderYield(ratiosR[0]?.dividendYieldTTM ?? null, cashR[0], profileR[0]?.marketCap ?? null);

  const hasQuality = q.piotroski !== null || q.altmanZ !== null || q.netDebtToEbitda !== null || q.interestCoverage !== null;
  const hasYield = y.totalYield !== null;
  if (!hasQuality && !hasYield) return null;

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Tier 3</span>
        <span className="signal-title">Quality, Health &amp; Shareholder Yield</span>
      </summary>
      <div className="signal-body">
        {hasQuality && <QualityGrid q={q} />}
        {hasYield && <YieldBlock y={y} />}
      </div>
    </details>
  );
}

export function QualityHealthSkeleton() {
  return (
    <section className="signal-section skeleton" aria-hidden="true">
      <div className="signal-summary-skel" />
    </section>
  );
}
