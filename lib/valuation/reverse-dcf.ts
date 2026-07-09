/**
 * Reverse DCF (AI-analysis roadmap, Phase 2).
 *
 * Instead of computing a fair value FROM growth assumptions, this inverts a
 * two-stage DCF: given today's price (equity value = market cap), it solves for
 * the constant free-cash-flow growth rate the market is implicitly pricing in
 * over a 10-year horizon. The output is ALWAYS a growth rate, never a price —
 * we frame everything as "what the current price implies," never a target.
 *
 * Equity-value model (deliberate): FMP's `freeCashFlow` is CFO − CapEx, and CFO
 * is after interest paid, so it is LEVERED free cash flow (cash to equity).
 * Discounting a levered stream must therefore compare to EQUITY value (market
 * cap) at a COST OF EQUITY — not to enterprise value at a WACC, which would
 * double-count the debt claim on any leveraged name. This keeps the model
 * internally consistent and matches the task: price = equity value.
 *
 * This module is PURE (no I/O, no fmp, no node built-ins) so the client slider
 * component can import and re-run it on every assumption change.
 */

/** Projection horizon (years) for the explicit stage. */
export const DCF_YEARS = 10;

/** Bisection search bounds for the implied growth rate. */
export const G_MIN = -0.5; // −50%/yr
export const G_MAX = 2.0; //  +200%/yr

export type ReverseDcfInputs = {
  /** Equity value the price implies: price × diluted shares (or market cap). */
  marketCap: number;
  /** Normalized base-year levered FCF (FCF₀); see normalizedBaseFcf. */
  baseFcf: number;
  /** Discount rate = cost of equity, as a fraction (e.g. 0.09 for 9%). */
  costOfEquity: number;
  /** Perpetual (terminal) growth rate, as a fraction (e.g. 0.025 for 2.5%). */
  terminalGrowth: number;
  /** Override the horizon; defaults to DCF_YEARS. */
  years?: number;
};

/**
 * Present value of a levered-FCF stream that grows at `g` for `years`, plus a
 * Gordon-growth terminal value, all discounted at `r` (cost of equity).
 *
 *   PV = Σ_{t=1..N} FCF₀(1+g)^t / (1+r)^t
 *      + [ FCF₀(1+g)^N (1+gT) / (r − gT) ] / (1+r)^N
 *
 * Strictly increasing in `g` when r > gT (guaranteed by the caller), which is
 * what makes the bisection solve well-defined.
 */
export function presentValue(
  baseFcf: number,
  g: number,
  r: number,
  gT: number,
  years: number = DCF_YEARS
): number {
  let pv = 0;
  for (let t = 1; t <= years; t++) {
    pv += (baseFcf * Math.pow(1 + g, t)) / Math.pow(1 + r, t);
  }
  const fcfTerminalYear = baseFcf * Math.pow(1 + g, years);
  const terminalValue = (fcfTerminalYear * (1 + gT)) / (r - gT);
  pv += terminalValue / Math.pow(1 + r, years);
  return pv;
}

export type ImpliedGrowth =
  /** Solved cleanly inside [G_MIN, G_MAX]. */
  | { kind: "ok"; growth: number }
  /** Price implies growth below the search floor (clamped to G_MIN). */
  | { kind: "below_floor"; growth: number }
  /** Price implies growth above the search ceiling (clamped to G_MAX). */
  | { kind: "above_ceiling"; growth: number }
  /** Inputs can't support a reverse DCF (negative FCF, r ≤ gT, etc.). */
  | { kind: "invalid"; reason: string };

/**
 * Solve for the constant FCF growth rate that makes the model's present value
 * equal today's equity value. Bisection over [G_MIN, G_MAX]; monotonicity of
 * `presentValue` in `g` guarantees convergence.
 */
export function solveImpliedGrowth(inp: ReverseDcfInputs): ImpliedGrowth {
  const { marketCap, baseFcf, costOfEquity: r, terminalGrowth: gT, years = DCF_YEARS } = inp;

  if (!(baseFcf > 0)) {
    return { kind: "invalid", reason: "base free cash flow is not positive" };
  }
  if (!(marketCap > 0)) {
    return { kind: "invalid", reason: "market cap unavailable" };
  }
  if (!(r > gT)) {
    return { kind: "invalid", reason: "discount rate must exceed terminal growth" };
  }

  const pvAt = (g: number) => presentValue(baseFcf, g, r, gT, years);

  // Outside the bracket: the price implies a rate beyond our search window.
  if (pvAt(G_MIN) > marketCap) return { kind: "below_floor", growth: G_MIN };
  if (pvAt(G_MAX) < marketCap) return { kind: "above_ceiling", growth: G_MAX };

  let lo = G_MIN;
  let hi = G_MAX;
  const tol = marketCap * 1e-9;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const pv = pvAt(mid);
    if (Math.abs(pv - marketCap) <= tol) return { kind: "ok", growth: mid };
    if (pv < marketCap) lo = mid;
    else hi = mid;
  }
  return { kind: "ok", growth: (lo + hi) / 2 };
}

/**
 * Normalized base-year FCF: the mean of the most recent `k` annual FCF values.
 * A single year of FCF is noisy (working-capital swings, lumpy capex) and a
 * reverse DCF amplifies that noise straight into the implied-growth headline, so
 * we smooth it. Callers should DISPLAY the base they used.
 *
 * @param seriesOldestFirst annual FCF, oldest → newest
 */
export function normalizedBaseFcf(seriesOldestFirst: number[], k = 3): number | null {
  const xs = seriesOldestFirst.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return null;
  const recent = xs.slice(-k);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

/**
 * Compound annual growth rate of an FCF series, GUARDED against the classic
 * sign-change / non-positive-base blow-up (same failure mode handled by
 * computeDollarYoY in lib/scoring/fundamentals.ts): a CAGR is only meaningful
 * when both endpoints are positive. Returns null otherwise so the UI can fall
 * back to "not meaningful" rather than print a nonsense number.
 *
 * @param seriesOldestFirst annual FCF, oldest → newest
 */
export function fcfCagr(seriesOldestFirst: number[]): number | null {
  const xs = seriesOldestFirst.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return null;
  const first = xs[0];
  const last = xs[xs.length - 1];
  if (!(first > 0) || !(last > 0)) return null; // sign change or non-positive base
  const n = xs.length - 1;
  return Math.pow(last / first, 1 / n) - 1;
}
