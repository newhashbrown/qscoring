"use client";

import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { FACTOR_NAMES, type FactorName, type ScoreHistoryPoint, type SignalChange } from "@/lib/score-history";
import { rangePosition } from "@/lib/scoring/percentile";

const RANGE_PHRASE: Record<NonNullable<ReturnType<typeof rangePosition>["band"]>, string> = {
  high: "near its 30-day high",
  "above-mid": "in the upper half of its 30-day range",
  mid: "mid its 30-day range",
  "below-mid": "in the lower half of its 30-day range",
  low: "near its 30-day low",
};

const VIEW_W = 1000;
const VIEW_H = 220;

const SIGNAL_LABEL: Record<string, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

// Muted, distinguishable hues for the five factor lines; composite uses the
// site accent and a heavier stroke so it reads as the primary series.
const FACTOR_COLOR: Record<FactorName, string> = {
  value: "#6ea8fe",
  growth: "#9b8cff",
  momentum: "#ffb347",
  profitability: "#5ad1b0",
  risk: "#ff7a93",
};
const FACTOR_LABEL: Record<FactorName, string> = {
  value: "Value",
  growth: "Growth",
  momentum: "Momentum",
  profitability: "Profitability",
  risk: "Risk",
};

type ApiResponse = {
  points?: ScoreHistoryPoint[];
  lastSignalChange?: SignalChange | null;
  error?: string;
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function signalLabel(s: string): string {
  return SIGNAL_LABEL[s] ?? s;
}

export default function ScoreHistory({ ticker }: { ticker: string }) {
  const [points, setPoints] = useState<ScoreHistoryPoint[] | null>(null);
  const [change, setChange] = useState<SignalChange | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setHidden(false);
    setHoverIdx(null);
    fetch(`/api/score-history/${encodeURIComponent(ticker)}`)
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if (cancelled) return;
        // Need at least two points to draw a trend; otherwise hide the block.
        if (d.error || !d.points || d.points.length < 2) {
          setHidden(true);
          return;
        }
        setPoints(d.points);
        setChange(d.lastSignalChange ?? null);
      })
      .catch(() => {
        if (!cancelled) setHidden(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const xAt = (i: number, n: number) => (i / Math.max(1, n - 1)) * VIEW_W;
  const yAt = (score: number) => VIEW_H - (score / 100) * VIEW_H;

  const compositePath = useMemo(() => {
    if (!points) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i, points.length).toFixed(2)},${yAt(p.composite).toFixed(2)}`)
      .join(" ");
  }, [points]);

  const factorPaths = useMemo(() => {
    if (!points) return {} as Record<FactorName, string>;
    const out = {} as Record<FactorName, string>;
    for (const f of FACTOR_NAMES) {
      let d = "";
      let started = false;
      points.forEach((p, i) => {
        const v = p.factors[f];
        if (v === null || !Number.isFinite(v)) return; // gap — skip null factor scores
        d += `${started ? "L" : "M"}${xAt(i, points.length).toFixed(2)},${yAt(v).toFixed(2)} `;
        started = true;
      });
      out[f] = d.trim();
    }
    return out;
  }, [points]);

  if (hidden) return null;
  if (!points) {
    return (
      <section className="score-history">
        <div className="sh-head">
          <span className="section-eyebrow">Tracked history</span>
          <h2 className="section-title">QScore Over Time</h2>
        </div>
        <div className="sh-skeleton" />
      </section>
    );
  }

  const changeIdx = change ? points.findIndex((p) => p.date === change.date) : -1;
  const hovered = hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];

  function onMove(e: ReactMouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    const idx = Math.min(points!.length - 1, Math.max(0, Math.round(xRel * (points!.length - 1))));
    setHoverIdx(idx);
  }

  const hoverX = hoverIdx !== null ? xAt(hoverIdx, points.length) : null;

  return (
    <section className="score-history" aria-labelledby="sh-heading">
      <div className="sh-head">
        <div className="sh-title">
          <span className="section-eyebrow">Tracked history</span>
          <h2 id="sh-heading" className="section-title">QScore Over Time</h2>
        </div>
        <div className="sh-readout">
          <span className="sh-readout-date">{fmtDate(hovered.date)}</span>
          <span className="sh-readout-score">{hovered.composite}</span>
          <span className={`sh-readout-signal tone-${hovered.signal === "SHORT" ? "bearish" : hovered.signal === "HOLD" ? "neutral" : "bullish"}`}>
            {signalLabel(hovered.signal)}
          </span>
        </div>
      </div>

      <svg
        className="sh-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label={`QScore history for ${ticker}`}
      >
        {[0, 25, 50, 75, 100].map((g) => (
          <line key={g} x1={0} x2={VIEW_W} y1={yAt(g)} y2={yAt(g)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}

        {FACTOR_NAMES.map((f) => (
          <path key={f} d={factorPaths[f]} fill="none" stroke={FACTOR_COLOR[f]} strokeWidth="1" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />
        ))}

        <path d={compositePath} fill="none" stroke="var(--accent)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />

        {changeIdx >= 0 && (
          <line
            x1={xAt(changeIdx, points.length)}
            x2={xAt(changeIdx, points.length)}
            y1={0}
            y2={VIEW_H}
            stroke="var(--accent)"
            strokeOpacity="0.5"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {hoverX !== null && (
          <line x1={hoverX} x2={hoverX} y1={0} y2={VIEW_H} stroke="rgba(255,255,255,0.2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      <div className="sh-legend">
        <span className="sh-legend-item composite"><i style={{ background: "var(--accent)" }} />Composite</span>
        {FACTOR_NAMES.map((f) => (
          <span key={f} className="sh-legend-item"><i style={{ background: FACTOR_COLOR[f] }} />{FACTOR_LABEL[f]}</span>
        ))}
      </div>

      <p className="sh-footnote">
        {change ? (
          <>
            Most recent signal change: <strong>{fmtDate(change.date)}</strong> ({signalLabel(change.from)} → {signalLabel(change.to)}).
          </>
        ) : (
          <>Signal has held steady at <strong>{signalLabel(points[points.length - 1].signal)}</strong> across the tracked window.</>
        )}{" "}
        {(() => {
          const band = rangePosition(
            points[points.length - 1].composite,
            points.map((p) => p.composite)
          ).band;
          return band ? <>Composite is <strong>{RANGE_PHRASE[band]}</strong>. </> : null;
        })()}
        Reconstructed from {points.length} daily snapshots — no-look-ahead by construction.
      </p>
    </section>
  );
}
