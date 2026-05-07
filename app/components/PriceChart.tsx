"use client";

import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";

type Point = { date: string; price: number };

type RangeKey = "1M" | "3M" | "6M" | "1Y" | "5Y";

const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: "1M", label: "1M", days: 22 },
  { key: "3M", label: "3M", days: 65 },
  { key: "6M", label: "6M", days: 130 },
  { key: "1Y", label: "1Y", days: 252 },
  { key: "5Y", label: "5Y", days: 1300 },
];

const VIEW_W = 1000;
const VIEW_H = 240;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`;
}

export default function PriceChart({ ticker }: { ticker: string }) {
  const [history, setHistory] = useState<Point[] | null>(null);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch once per ticker; cache locally so range switches are instant.
  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setError(null);
    setHoverIdx(null);
    fetch(`/api/history/${encodeURIComponent(ticker)}`)
      .then((r) => r.json() as Promise<{ history?: Point[]; error?: string }>)
      .then((d) => {
        if (cancelled) return;
        if (d.error || !d.history || d.history.length === 0) {
          setError(d.error ?? "No price history available");
          return;
        }
        setHistory(d.history);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load price history");
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // History from FMP is newest-first; the chart needs oldest→newest. Slice for the range, then reverse.
  const data = useMemo<Point[]>(() => {
    if (!history) return [];
    const days = RANGES.find((r) => r.key === range)!.days;
    return history.slice(0, days).reverse();
  }, [history, range]);

  const stats = useMemo(() => {
    if (data.length < 2) {
      return { min: 0, max: 1, first: 0, last: 0, change: 0, changePct: 0, up: true };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const p of data) {
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    }
    const first = data[0].price;
    const last = data[data.length - 1].price;
    const change = last - first;
    const changePct = first > 0 ? change / first : 0;
    return { min, max, first, last, change, changePct, up: change >= 0 };
  }, [data]);

  if (error) {
    return (
      <div className="price-chart price-chart-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!history || data.length < 2) {
    return (
      <div className="price-chart price-chart-loading">
        <div className="chart-skeleton" />
      </div>
    );
  }

  const padding = (stats.max - stats.min) * 0.08 || 1;
  const yMin = stats.min - padding;
  const yMax = stats.max + padding;
  const yRange = yMax - yMin;

  const xAt = (i: number) => (i / Math.max(1, data.length - 1)) * VIEW_W;
  const yAt = (price: number) => VIEW_H - ((price - yMin) / yRange) * VIEW_H;

  const linePath = data.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yAt(p.price).toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;

  const trendColor = stats.up ? "var(--accent)" : "var(--red)";
  const gradientId = `priceGradient-${ticker}-${range}`;

  const displayPoint = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];
  const displayChange = hoverIdx !== null ? data[hoverIdx].price - data[0].price : stats.change;
  const displayChangePct = data[0].price > 0 ? displayChange / data[0].price : 0;

  function onMove(e: ReactMouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    const idx = Math.min(data.length - 1, Math.max(0, Math.round(xRel * (data.length - 1))));
    setHoverIdx(idx);
  }

  const hoverX = hoverIdx !== null ? xAt(hoverIdx) : null;
  const hoverY = hoverIdx !== null ? yAt(data[hoverIdx].price) : null;
  const changeUp = displayChange >= 0;

  return (
    <div className="price-chart">
      <div className="chart-header">
        <div className="chart-summary">
          <div className="chart-price">{fmtPrice(displayPoint.price)}</div>
          <div className={`chart-change ${changeUp ? "up" : "down"}`}>
            {changeUp ? "▲" : "▼"} {fmtPrice(Math.abs(displayChange))} (
            {(displayChangePct * 100).toFixed(2)}%)
          </div>
          <div className="chart-date">
            {hoverIdx !== null ? fmtDate(data[hoverIdx].date) : `${range} change`}
          </div>
        </div>
        <div className="chart-range" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={`range-btn ${range === r.key ? "active" : ""}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label={`Price chart for ${ticker} over ${range}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={trendColor} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {hoverX !== null && hoverY !== null && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={0}
              y2={VIEW_H}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hoverX} cy={hoverY} r="4" fill={trendColor} stroke="var(--bg-card)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
    </div>
  );
}
