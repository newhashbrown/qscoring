import { fmp } from "@/lib/scoring/fmp";
import {
  summarizeConsensus,
  ratingRevisionTrend,
  earningsSurpriseHistory,
  priceTargetRevision,
  type ConsensusSummary,
  type RevisionTrend,
  type SurpriseHistory,
  type PriceTargetRevision,
} from "@/lib/scoring/analyst";

function pct(fraction: number | null, digits = 0): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

function fmtDateShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const REVISION_TONE: Record<RevisionTrend["direction"], "bullish" | "bearish" | "neutral"> = {
  upgrading: "bullish",
  downgrading: "bearish",
  stable: "neutral",
};
const REVISION_LABEL: Record<RevisionTrend["direction"], string> = {
  upgrading: "Analysts upgrading",
  downgrading: "Analysts downgrading",
  stable: "Ratings steady",
};

function ConsensusBar({ c }: { c: ConsensusSummary }) {
  const seg = (n: number) => (c.total > 0 ? `${(100 * n) / c.total}%` : "0%");
  return (
    <div className="as-block">
      <div className="as-row">
        <span className="as-label">Consensus</span>
        <span className="as-value">
          {c.label ?? "—"} · <strong>{pct(c.bullishPct)}</strong> buy-rated
        </span>
      </div>
      <div className="consensus-bar" role="img" aria-label={`${c.buyCount} buy, ${c.holdCount} hold, ${c.sellCount} sell`}>
        <span className="cb-buy" style={{ width: seg(c.buyCount) }} />
        <span className="cb-hold" style={{ width: seg(c.holdCount) }} />
        <span className="cb-sell" style={{ width: seg(c.sellCount) }} />
      </div>
      <div className="consensus-legend">
        <span><i className="cb-buy" /> {c.buyCount} buy</span>
        <span><i className="cb-hold" /> {c.holdCount} hold</span>
        <span><i className="cb-sell" /> {c.sellCount} sell</span>
        <span className="as-muted">{c.total} analysts</span>
      </div>
    </div>
  );
}

function RevisionLine({ r }: { r: RevisionTrend }) {
  const tone = REVISION_TONE[r.direction];
  const arrow = r.direction === "upgrading" ? "▲" : r.direction === "downgrading" ? "▼" : "→";
  return (
    <div className="as-block">
      <div className="as-row">
        <span className="as-label">Revision trend</span>
        <span className={`as-value tone-${tone}`}>
          <span aria-hidden="true">{arrow}</span> {REVISION_LABEL[r.direction]}
        </span>
      </div>
      <p className="as-detail">
        Buy-rated share {pct(r.bullishSharePrior)} → <strong>{pct(r.bullishShareNow)}</strong> over ~{r.months} months
        {r.shiftPoints !== null && (
          <> ({r.shiftPoints >= 0 ? "+" : ""}{r.shiftPoints.toFixed(0)}pp)</>
        )}.
      </p>
    </div>
  );
}

const TARGET_TONE: Record<PriceTargetRevision["direction"], "bullish" | "bearish" | "neutral"> = {
  raising: "bullish",
  lowering: "bearish",
  stable: "neutral",
};
const TARGET_LABEL: Record<PriceTargetRevision["direction"], string> = {
  raising: "Targets rising",
  lowering: "Targets cut",
  stable: "Targets steady",
};

function EstimateRevisionLine({ r }: { r: PriceTargetRevision }) {
  const tone = TARGET_TONE[r.direction];
  const arrow = r.direction === "raising" ? "▲" : r.direction === "lowering" ? "▼" : "→";
  return (
    <div className="as-block">
      <div className="as-row">
        <span className="as-label">Estimate revision (price target)</span>
        <span className={`as-value tone-${tone}`}>
          <span aria-hidden="true">{arrow}</span> {TARGET_LABEL[r.direction]}
        </span>
      </div>
      <p className="as-detail">
        Avg target ${r.lastQuarterAvg?.toFixed(0) ?? "—"} (last qtr, {r.lastQuarterCount} analysts) →{" "}
        <strong>${r.lastMonthAvg?.toFixed(0) ?? "—"}</strong> (last mo, {r.lastMonthCount})
        {r.changePct !== null && (
          <> ({r.changePct >= 0 ? "+" : ""}{(r.changePct * 100).toFixed(1)}%)</>
        )}.
      </p>
    </div>
  );
}

function SurpriseTable({ h }: { h: SurpriseHistory }) {
  return (
    <div className="as-block">
      <div className="as-row">
        <span className="as-label">EPS surprise history</span>
        {h.beatRate !== null && (
          <span className="as-value">
            Beat <strong>{pct(h.beatRate)}</strong> of last {h.quarters.filter((q) => q.beat !== null).length}
          </span>
        )}
      </div>
      <div className="as-scroll">
        <table className="as-table">
          <thead>
            <tr><th>Quarter</th><th>Est.</th><th>Actual</th><th>Surprise</th></tr>
          </thead>
          <tbody>
            {h.quarters.map((q) => (
              <tr key={q.date}>
                <td className="as-rowhead">{fmtDateShort(q.date)}</td>
                <td>{q.epsEstimated === null ? "—" : `$${q.epsEstimated.toFixed(2)}`}</td>
                <td>{q.epsActual === null ? "—" : `$${q.epsActual.toFixed(2)}`}</td>
                <td className={q.beat === null ? "" : q.beat ? "tone-bullish" : "tone-bearish"}>
                  {q.surprisePct === null
                    ? q.beat === null ? "—" : q.beat ? "beat" : "miss"
                    : `${q.surprisePct >= 0 ? "+" : ""}${(q.surprisePct * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AnalystSignals({ ticker }: { ticker: string }) {
  const [consensusR, gradesR, targetR, earningsR] = await Promise.all([
    fmp.gradesConsensus(ticker).catch(() => []),
    fmp.gradesHistorical(ticker, 12).catch(() => []),
    fmp.priceTargetSummary(ticker).catch(() => []),
    fmp.earnings(ticker, 12).catch(() => []),
  ]);

  const consensus = summarizeConsensus(consensusR[0]);
  const revision = ratingRevisionTrend(gradesR, 3);
  const estimateRevision = priceTargetRevision(targetR[0]);
  const surprise = earningsSurpriseHistory(earningsR, 8);

  if (!consensus && !revision && !estimateRevision && surprise.quarters.length === 0) return null;

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Tier 3</span>
        <span className="signal-title">Analyst &amp; Earnings Signals</span>
      </summary>
      <div className="signal-body">
        {consensus && <ConsensusBar c={consensus} />}
        {estimateRevision && <EstimateRevisionLine r={estimateRevision} />}
        {revision && <RevisionLine r={revision} />}
        {surprise.quarters.length > 0 && <SurpriseTable h={surprise} />}
      </div>
    </details>
  );
}

export function AnalystSignalsSkeleton() {
  return (
    <section className="signal-section skeleton" aria-hidden="true">
      <div className="signal-summary-skel" />
    </section>
  );
}
