/**
 * "Trader's lens" — derived technical-setup context for the active/swing trader.
 *
 * Pure functions only, no FMP I/O (same contract as company-header.ts). They
 * take already-fetched payloads — the live price, FMP's 50/200-day moving
 * averages from /quote, the parsed 52-week range, and the EOD price history —
 * and derive trend / breakout-proximity / momentum / volume-confirmation
 * scalars plus a small set of named "setup" tags.
 *
 * This is PRESENTATION/CONTEXT only. It does NOT feed the five-factor QScore;
 * keeping it out of the scoring path is deliberate so a technical overlay can
 * never silently move a fundamental score. Every field is nullable and degrades
 * gracefully on thin history. Unit-testable without network mocks, matching the
 * factor-test pattern in zscore.test.ts / company-header.test.ts.
 */

import type { PricePoint } from "./fmp";
import type { TraderLens, TraderSetup } from "./types";

// Breakout proximity: price within 3% *below* the 52-week high (or above it)
// counts as "near the high".
const NEAR_HIGH_PCT = -0.03;
// Breakdown proximity: price within 5% above the 52-week low counts as "near
// the low".
const NEAR_LOW_PCT = 0.05;
// Volume confirmation: recent short-window average share volume ≥ 1.5× the
// longer-window average = "rising_volume".
const RISING_VOLUME_RATIO = 1.5;
const VOLUME_SHORT_WINDOW = 5;
const VOLUME_LONG_WINDOW = 20;
// Momentum: a 20-trading-day price return ≥ 10% = "strong_momentum".
const RETURN_WINDOW = 20;
const STRONG_MOMENTUM_RETURN = 0.1;

/** Signed fraction of `value` away from `reference`: (value − ref) / ref. */
export function pctFrom(
  value: number | null | undefined,
  reference: number | null | undefined
): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(reference)) return null;
  if ((reference as number) <= 0) return null;
  return ((value as number) - (reference as number)) / (reference as number);
}

/**
 * Trailing price return over the most-recent `days` bars. `history` is
 * most-recent-first (the same ordering company-header.ts relies on), so the
 * current close is index 0 and the comparison close is index `days`. Needs
 * strictly more than `days` bars; returns null otherwise.
 */
export function trailingReturn(
  history: readonly PricePoint[] | null | undefined,
  days: number = RETURN_WINDOW
): number | null {
  if (!history || history.length <= days) return null;
  const current = history[0]?.price;
  const past = history[days]?.price;
  if (!Number.isFinite(current) || !Number.isFinite(past)) return null;
  if ((past as number) <= 0) return null;
  return ((current as number) - (past as number)) / (past as number);
}

/** Mean share volume over the most-recent `days` bars; skips bad bars. */
function avgVolume(
  history: readonly PricePoint[] | null | undefined,
  days: number
): number | null {
  if (!history || history.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const bar of history.slice(0, days)) {
    const volume = bar?.volume;
    if (!Number.isFinite(volume) || (volume as number) <= 0) continue;
    sum += volume as number;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

/**
 * Ratio of recent short-window average share volume to the longer-window
 * average — an RVOL-style "is this name unusually active lately" figure.
 */
export function volumeTrend(
  history: readonly PricePoint[] | null | undefined,
  shortDays: number = VOLUME_SHORT_WINDOW,
  longDays: number = VOLUME_LONG_WINDOW
): number | null {
  const short = avgVolume(history, shortDays);
  const long = avgVolume(history, longDays);
  if (short === null || long === null || long <= 0) return null;
  return short / long;
}

type SetupInputs = {
  pctFrom50dma: number | null;
  pctFrom200dma: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  return20d: number | null;
  volTrend: number | null;
  sma50: number | null | undefined;
  sma200: number | null | undefined;
};

/** Derive the named setup tags from the computed scalars. */
function deriveSetups(m: SetupInputs): TraderSetup[] {
  const setups: TraderSetup[] = [];
  if (m.pctFrom50dma !== null) {
    setups.push(m.pctFrom50dma >= 0 ? "above_50dma" : "below_50dma");
  }
  if (m.pctFrom200dma !== null) {
    setups.push(m.pctFrom200dma >= 0 ? "above_200dma" : "below_200dma");
  }
  // Trend regime from the two moving averages themselves (the classic
  // golden/death-cross read), independent of where price sits today.
  if (
    Number.isFinite(m.sma50) &&
    Number.isFinite(m.sma200) &&
    (m.sma200 as number) > 0
  ) {
    setups.push((m.sma50 as number) >= (m.sma200 as number) ? "uptrend" : "downtrend");
  }
  if (m.pctFrom52wHigh !== null && m.pctFrom52wHigh >= NEAR_HIGH_PCT) {
    setups.push("near_52w_high");
  }
  if (m.pctFrom52wLow !== null && m.pctFrom52wLow <= NEAR_LOW_PCT) {
    setups.push("near_52w_low");
  }
  if (m.volTrend !== null && m.volTrend >= RISING_VOLUME_RATIO) {
    setups.push("rising_volume");
  }
  if (m.return20d !== null && m.return20d >= STRONG_MOMENTUM_RETURN) {
    setups.push("strong_momentum");
  }
  return setups;
}

export type TraderLensInputs = {
  price: number | null | undefined;
  sma50: number | null | undefined; // quote.priceAvg50
  sma200: number | null | undefined; // quote.priceAvg200
  week52High: number | null | undefined;
  week52Low: number | null | undefined;
  history: readonly PricePoint[] | null | undefined;
};

/** Assemble the full TraderLens from already-fetched payload fields. */
export function buildTraderLens(input: TraderLensInputs): TraderLens {
  const pctFrom50dma = pctFrom(input.price, input.sma50);
  const pctFrom200dma = pctFrom(input.price, input.sma200);
  const pctFrom52wHigh = pctFrom(input.price, input.week52High);
  const pctFrom52wLow = pctFrom(input.price, input.week52Low);
  const return20d = trailingReturn(input.history, RETURN_WINDOW);
  const volTrend = volumeTrend(input.history);
  const setups = deriveSetups({
    pctFrom50dma,
    pctFrom200dma,
    pctFrom52wHigh,
    pctFrom52wLow,
    return20d,
    volTrend,
    sma50: input.sma50,
    sma200: input.sma200,
  });
  return {
    pctFrom50dma,
    pctFrom200dma,
    pctFrom52wHigh,
    pctFrom52wLow,
    return20d,
    volumeTrend: volTrend,
    setups,
  };
}
