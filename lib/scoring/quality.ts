/**
 * Quality / health screens + total shareholder yield (Phase 5b).
 *
 * Pure derivations over already-fetched FMP payloads:
 *   - Piotroski F & Altman Z (/financial-scores) with interpretive bands
 *   - net debt / EBITDA (key-metrics-ttm) and interest coverage (ratios-ttm)
 *   - dividend + net-buyback = total shareholder yield (ratios + cash-flow)
 */

import type { CashFlowStatement, FinancialScores, KeyMetricsTtm, RatiosTtm } from "./fmp";
import { notApplicableQuality } from "./applicability";

function finite(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
}

export type AltmanZone = "distress" | "grey" | "safe";
export type PiotroskiBand = "weak" | "moderate" | "strong";
export type LeverageBand = "net-cash" | "low" | "moderate" | "high";
export type CoverageBand = "weak" | "adequate" | "strong" | "n/a";

export type QualityScreens = {
  piotroski: number | null; // 0–9
  piotroskiBand: PiotroskiBand | null;
  altmanZ: number | null;
  altmanZone: AltmanZone | null;
  netDebtToEbitda: number | null;
  leverageBand: LeverageBand | null;
  interestCoverage: number | null;
  coverageBand: CoverageBand | null;
  // Quality keys not meaningful for this company's industry group (model v0.4,
  // lib/scoring/applicability.ts). Nulled above + collected here so the render
  // path shows "n/m" and the completeness check excludes them (vs. missing data).
  notMeaningful: ReadonlySet<string>;
};

function piotroskiBand(s: number): PiotroskiBand {
  return s >= 7 ? "strong" : s <= 3 ? "weak" : "moderate";
}

// Classic Altman Z bands for public industrials: <1.81 distress, ≤2.99 grey.
function altmanZone(z: number): AltmanZone {
  return z < 1.81 ? "distress" : z <= 2.99 ? "grey" : "safe";
}

function leverageBand(nd: number): LeverageBand {
  return nd < 0 ? "net-cash" : nd <= 2 ? "low" : nd <= 4 ? "moderate" : "high";
}

function coverageBand(coverage: number, netDebt: number | null): CoverageBand {
  // FMP returns exactly 0 when interest expense is ≈0 (no debt to cover) — that
  // is "not applicable", not weak. Real distress shows a small POSITIVE ratio.
  if (coverage === 0) return "n/a";
  // Negative EBIT can't cover interest, unless the company is also net-cash
  // (nothing meaningful to cover).
  if (coverage < 0) return netDebt !== null && netDebt < 0 ? "n/a" : "weak";
  if (coverage < 3) return "weak";
  if (coverage < 8) return "adequate";
  return "strong";
}

export function qualityScreens(
  scores: FinancialScores | null | undefined,
  km: KeyMetricsTtm | null | undefined,
  ratios: RatiosTtm | null | undefined,
  sector?: string | null,
  industry?: string | null
): QualityScreens {
  // model v0.4: Altman-Z / net-debt-EBITDA / interest-coverage are enterprise/
  // industrial constructs that misfire on banks (see lib/scoring/applicability.ts).
  // Null a not-meaningful metric so its band is null and it drops out of the
  // completeness check — treat as excluded, never as a bad/zero value.
  const nm = notApplicableQuality(sector, industry);

  const piotroski = finite(scores?.piotroskiScore);
  const altmanZ = nm.has("altmanZ") ? null : finite(scores?.altmanZScore);
  const netDebtToEbitda = nm.has("netDebtToEbitda") ? null : finite(km?.netDebtToEBITDATTM);
  const interestCoverage = nm.has("interestCoverage") ? null : finite(ratios?.interestCoverageRatioTTM);

  return {
    piotroski,
    piotroskiBand: piotroski === null ? null : piotroskiBand(piotroski),
    altmanZ,
    altmanZone: altmanZ === null ? null : altmanZone(altmanZ),
    netDebtToEbitda,
    leverageBand: netDebtToEbitda === null ? null : leverageBand(netDebtToEbitda),
    interestCoverage,
    coverageBand: interestCoverage === null ? null : coverageBand(interestCoverage, netDebtToEbitda),
    notMeaningful: nm,
  };
}

export type ShareholderYield = {
  dividendYield: number | null; // fraction
  buybackYield: number | null; // fraction (net buyback ÷ market cap)
  totalYield: number | null;
};

export function shareholderYield(
  dividendYieldTTM: number | null | undefined,
  cashflow: CashFlowStatement | null | undefined,
  marketCap: number | null | undefined
): ShareholderYield {
  const dividendYield = finite(dividendYieldTTM);
  const cap = finite(marketCap);

  // FMP reports buybacks as cash OUTFLOWS (negative). Prefer netStockIssuance
  // (net of new issuance); fall back to gross repurchases. Negate so a net
  // buyback is a positive yield.
  let buybackYield: number | null = null;
  if (cap !== null && cap > 0) {
    const net = finite(cashflow?.netStockIssuance) ?? finite(cashflow?.commonStockRepurchased);
    if (net !== null) buybackYield = -net / cap;
  }

  const totalYield =
    dividendYield === null && buybackYield === null
      ? null
      : (dividendYield ?? 0) + (buybackYield ?? 0);

  return { dividendYield, buybackYield, totalYield };
}
