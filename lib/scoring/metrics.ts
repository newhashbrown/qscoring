/**
 * Heuristic metric scorers — map raw financial values to a 0–100 score.
 * Each scorer returns null for missing/invalid input so callers can drop them
 * from category aggregation rather than penalize for missing data.
 *
 * Thresholds based on common quant heuristics; will be replaced with
 * sector-relative z-scores once we have a population of scored stocks.
 */

type Point = readonly [number, number];

function piecewise(value: number, points: readonly Point[]): number {
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (value >= x1 && value <= x2) {
      const t = (value - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }
  return 50;
}

const valid = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);

// ─── VALUE ─────────────────────────────────────────────────────
export const scorePE = (pe: number | null): number | null =>
  !valid(pe) || pe < 0
    ? null
    : piecewise(pe, [
        [5, 100],
        [12, 85],
        [20, 60],
        [30, 35],
        [50, 15],
        [100, 0],
      ]);

export const scorePB = (pb: number | null): number | null =>
  !valid(pb) || pb < 0
    ? null
    : piecewise(pb, [
        [0.5, 100],
        [1.5, 80],
        [3, 55],
        [6, 30],
        [12, 10],
        [30, 0],
      ]);

export const scorePS = (ps: number | null): number | null =>
  !valid(ps) || ps < 0
    ? null
    : piecewise(ps, [
        [0.5, 100],
        [2, 80],
        [5, 55],
        [10, 30],
        [20, 10],
        [40, 0],
      ]);

export const scoreEvEbitda = (x: number | null): number | null =>
  !valid(x) || x < 0
    ? null
    : piecewise(x, [
        [5, 100],
        [10, 80],
        [15, 55],
        [25, 30],
        [40, 10],
        [80, 0],
      ]);

// ─── GROWTH ────────────────────────────────────────────────────
export const scoreRevenueGrowth = (g: number | null): number | null =>
  !valid(g)
    ? null
    : piecewise(g, [
        [-0.3, 0],
        [-0.05, 25],
        [0, 40],
        [0.08, 60],
        [0.2, 80],
        [0.4, 95],
        [0.7, 100],
      ]);

export const scoreEpsGrowth = (g: number | null): number | null =>
  !valid(g)
    ? null
    : piecewise(g, [
        [-0.5, 0],
        [-0.1, 20],
        [0, 40],
        [0.1, 60],
        [0.25, 80],
        [0.5, 95],
        [1.0, 100],
      ]);

// ─── PROFITABILITY ─────────────────────────────────────────────
export const scoreROE = (roe: number | null): number | null =>
  !valid(roe)
    ? null
    : piecewise(roe, [
        [-0.2, 0],
        [0, 20],
        [0.05, 35],
        [0.1, 55],
        [0.18, 80],
        [0.3, 100],
      ]);

export const scoreROA = (roa: number | null): number | null =>
  !valid(roa)
    ? null
    : piecewise(roa, [
        [-0.1, 0],
        [0, 25],
        [0.03, 45],
        [0.07, 65],
        [0.15, 90],
        [0.25, 100],
      ]);

export const scoreMargin = (m: number | null): number | null =>
  !valid(m)
    ? null
    : piecewise(m, [
        [-0.1, 0],
        [0, 25],
        [0.05, 40],
        [0.15, 65],
        [0.3, 90],
        [0.5, 100],
      ]);

export const scoreFcfYield = (y: number | null): number | null =>
  !valid(y)
    ? null
    : piecewise(y, [
        [-0.05, 0],
        [0, 30],
        [0.03, 55],
        [0.06, 75],
        [0.1, 90],
        [0.15, 100],
      ]);

// ─── RISK ──────────────────────────────────────────────────────
// Beta near 1.0 is "neutral"; further from 1.0 in either direction reduces score.
export const scoreBeta = (b: number | null): number | null => {
  if (!valid(b)) return null;
  const dist = Math.abs(b - 1.0);
  return piecewise(dist, [
    [0, 100],
    [0.3, 85],
    [0.6, 60],
    [1.0, 35],
    [1.5, 15],
    [2.5, 0],
  ]);
};

// Annualized realized volatility (e.g. 0.25 = 25%): lower is better.
export const scoreVolatility = (v: number | null): number | null =>
  !valid(v) || v < 0
    ? null
    : piecewise(v, [
        [0.1, 100],
        [0.2, 85],
        [0.3, 65],
        [0.5, 35],
        [0.8, 10],
        [1.5, 0],
      ]);

// ─── MOMENTUM ──────────────────────────────────────────────────
export const scoreReturn12mo = (r: number | null): number | null =>
  !valid(r)
    ? null
    : piecewise(r, [
        [-0.5, 0],
        [-0.2, 25],
        [0, 50],
        [0.2, 75],
        [0.5, 95],
        [1.0, 100],
      ]);

export const scoreReturn3mo = (r: number | null): number | null =>
  !valid(r)
    ? null
    : piecewise(r, [
        [-0.3, 0],
        [-0.1, 30],
        [0, 50],
        [0.1, 70],
        [0.25, 90],
        [0.5, 100],
      ]);

export const scoreReturn1mo = (r: number | null): number | null =>
  !valid(r)
    ? null
    : piecewise(r, [
        [-0.2, 0],
        [-0.05, 35],
        [0, 50],
        [0.05, 65],
        [0.15, 90],
        [0.3, 100],
      ]);

// RSI: 30–70 healthy band; <30 oversold (rebound potential), >70 overbought.
// For a momentum factor we score positive momentum highest while penalizing extremes.
export const scoreRsi = (rsi: number | null): number | null => {
  if (!valid(rsi)) return null;
  if (rsi < 30) return 60;
  if (rsi <= 50) return piecewise(rsi, [[30, 60], [50, 50]]);
  if (rsi <= 70) return piecewise(rsi, [[50, 50], [70, 88]]);
  if (rsi <= 80) return piecewise(rsi, [[70, 88], [80, 70]]);
  return piecewise(rsi, [[80, 70], [100, 20]]);
};

// 50d MA above 200d MA = golden cross (bullish).
export const scoreMaCross = (above: boolean | null): number | null => {
  if (above === null) return null;
  return above ? 78 : 32;
};
