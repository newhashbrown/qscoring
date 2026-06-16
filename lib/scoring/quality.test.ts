import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { qualityScreens, shareholderYield } from "./quality";
import type { CashFlowStatement, FinancialScores, KeyMetricsTtm, RatiosTtm } from "./fmp";

const approx = (a: number | null, b: number, eps = 1e-6) => a !== null && Math.abs(a - b) < eps;

function scores(piotroski: number | null, altman: number | null): FinancialScores {
  return { symbol: "X", altmanZScore: altman, piotroskiScore: piotroski, ebit: null, marketCap: null };
}
function km(netDebt: number | null): KeyMetricsTtm {
  return {
    marketCap: 0, evToEBITDATTM: null, returnOnEquityTTM: null, returnOnAssetsTTM: null,
    returnOnInvestedCapitalTTM: null, freeCashFlowYieldTTM: null, earningsYieldTTM: null,
    netDebtToEBITDATTM: netDebt,
  };
}
function ratios(coverage: number | null): RatiosTtm {
  return {
    priceToEarningsRatioTTM: null, priceToBookRatioTTM: null, priceToSalesRatioTTM: null,
    priceToEarningsGrowthRatioTTM: null, grossProfitMarginTTM: null, operatingProfitMarginTTM: null,
    netProfitMarginTTM: null, debtToEquityRatioTTM: null, dividendYieldTTM: null,
    interestCoverageRatioTTM: coverage,
  };
}

// ─── qualityScreens ──────────────────────────────────────────
test("qualityScreens: Piotroski & Altman bands", () => {
  const q = qualityScreens(scores(9, 12.3), km(-1), ratios(0));
  strictEqual(q.piotroski, 9);
  strictEqual(q.piotroskiBand, "strong");
  strictEqual(q.altmanZone, "safe");
  strictEqual(q.leverageBand, "net-cash");
  strictEqual(q.coverageBand, "n/a"); // zero coverage but net cash → nothing to cover
});

test("qualityScreens: distress / weak / high-leverage thresholds", () => {
  const q = qualityScreens(scores(2, 1.2), km(5), ratios(1.5));
  strictEqual(q.piotroskiBand, "weak");
  strictEqual(q.altmanZone, "distress");
  strictEqual(q.leverageBand, "high");
  strictEqual(q.coverageBand, "weak"); // coverage 1.5 < 3
});

test("qualityScreens: coverage 0 means no interest expense → n/a even with net debt", () => {
  // AAPL case: tiny positive net debt but FMP coverage 0 (≈no interest expense).
  strictEqual(qualityScreens(scores(9, 12), km(0.3), ratios(0)).coverageBand, "n/a");
});

test("qualityScreens: grey zone, moderate leverage, adequate/strong coverage", () => {
  strictEqual(qualityScreens(scores(5, 2.5), km(3), ratios(5)).altmanZone, "grey");
  strictEqual(qualityScreens(scores(5, 2.5), km(3), ratios(5)).leverageBand, "moderate");
  strictEqual(qualityScreens(scores(5, 2.5), km(3), ratios(5)).coverageBand, "adequate");
  strictEqual(qualityScreens(scores(5, 2.5), km(1), ratios(12)).coverageBand, "strong");
});

test("qualityScreens: missing data → null bands, no throw", () => {
  const q = qualityScreens(null, null, null);
  strictEqual(q.piotroskiBand, null);
  strictEqual(q.altmanZone, null);
  strictEqual(q.leverageBand, null);
  strictEqual(q.coverageBand, null);
});

// ─── shareholderYield ────────────────────────────────────────
function cf(netStockIssuance: number | null): CashFlowStatement {
  return {
    date: "2025-09-27", filingDate: null, fiscalYear: "2025", period: "FY", freeCashFlow: null,
    netStockIssuance, commonStockRepurchased: netStockIssuance, commonDividendsPaid: null,
  };
}

test("shareholderYield: dividend + net buyback (outflow negated)", () => {
  // AAPL-ish: div 0.4%, buyback 90.7B on 4276B cap ≈ 2.12%.
  const y = shareholderYield(0.004, cf(-90_700_000_000), 4_276_000_000_000);
  strictEqual(approx(y.dividendYield, 0.004), true);
  strictEqual(approx(y.buybackYield!, 90_700_000_000 / 4_276_000_000_000), true);
  strictEqual(approx(y.totalYield!, 0.004 + 90_700_000_000 / 4_276_000_000_000), true);
});

test("shareholderYield: net issuer → negative buyback yield", () => {
  const y = shareholderYield(0, cf(50_000_000), 1_000_000_000);
  strictEqual(approx(y.buybackYield!, -0.05), true);
});

test("shareholderYield: missing market cap → buyback null; dividend alone still totals", () => {
  const y = shareholderYield(0.03, cf(-1000), null);
  strictEqual(y.buybackYield, null);
  strictEqual(approx(y.totalYield!, 0.03), true);
});
