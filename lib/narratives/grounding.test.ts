import { test } from "node:test";
import { strictEqual, notStrictEqual, deepStrictEqual } from "node:assert/strict";
import {
  buildGroundingPayload,
  scoreBandOf,
  stableHash,
  type GroundingInputs,
  type NarrativeFundamentalRow,
  type NarrativeSnapshotRow,
} from "./grounding";

// ─── fixtures ──────────────────────────────────────────────────────────────
function fy(
  year: string,
  over: Partial<NarrativeFundamentalRow> = {}
): NarrativeFundamentalRow {
  return {
    fiscal_year: year,
    fiscal_period_end: `${year}-09-30`,
    period: "FY",
    reported_currency: "USD",
    revenue: 100e9,
    eps_diluted: 5,
    free_cash_flow: 20e9,
    gross_margin: 0.42,
    operating_margin: 0.3,
    net_margin: 0.25,
    total_equity: 60e9,
    total_debt: 100e9,
    cash_and_equivalents: 30e9,
    ebitda: 40e9,
    net_income: 25e9,
    shares_diluted: 15e9,
    ...over,
  };
}

function snapshot(over: Partial<NarrativeSnapshotRow> = {}): NarrativeSnapshotRow {
  return {
    ticker: "AAPL",
    snapshot_date: "2026-07-07",
    company_name: "Apple Inc.",
    composite: 73,
    long_term: 71,
    short_term: 68,
    signal: "HOLD",
    confidence: "MEDIUM",
    price: 210,
    categories_json: JSON.stringify([
      { name: "value", label: "Value", score: 41 },
      { name: "growth", label: "Growth", score: 66 },
    ]),
    ...over,
  };
}

function inputs(over: {
  snapshot?: Partial<NarrativeSnapshotRow>;
  fundamentals?: NarrativeFundamentalRow[];
  universePercentile?: number | null;
} = {}): GroundingInputs {
  return {
    snapshot: snapshot(over.snapshot),
    fundamentals:
      over.fundamentals ??
      [
        fy("2021", { revenue: 366e9 }),
        fy("2022", { revenue: 394e9 }),
        fy("2023", { revenue: 383e9 }),
        fy("2024", { revenue: 391e9 }),
        fy("2025", { revenue: 416e9, eps_diluted: 6.75, shares_diluted: 15e9 }),
      ],
    factor: { beta_mkt_rf: 1.18, beta_smb: -0.22, beta_hml: -0.35, beta_mom: 0.1 },
    universePercentile: over.universePercentile ?? 82,
  };
}

// ─── score band ────────────────────────────────────────────────────────────
test("scoreBandOf: decade bands, 90-100 is the top bucket", () => {
  strictEqual(scoreBandOf(73), "70-79");
  strictEqual(scoreBandOf(70), "70-79");
  strictEqual(scoreBandOf(69), "60-69");
  strictEqual(scoreBandOf(90), "90-100");
  strictEqual(scoreBandOf(100), "90-100");
  strictEqual(scoreBandOf(0), "0-9");
});

// ─── payload construction ──────────────────────────────────────────────────
test("buildGroundingPayload: computes valuation from price × latest FY", () => {
  const { payload } = buildGroundingPayload(inputs());
  // P/E = round(210 / 6.75) = round(31.11) = 31
  strictEqual(payload.valuation.pe_ratio, 31);
  // market cap = 210 * 15e9 = 3.15e12 → 3,150,000 (USD millions), 3 sig figs
  strictEqual(payload.valuation.market_cap_usd_m, 3150000);
  strictEqual(payload.qscore.band, "70-79");
  strictEqual(payload.qscore.universe_percentile, 82);
  deepStrictEqual(payload.fundamentals.fiscal_years, ["2021", "2022", "2023", "2024", "2025"]);
  strictEqual(payload.fundamentals.latest_fiscal_year, "2025");
  // margins are stored as percent
  strictEqual(payload.fundamentals.net_margin_pct, 25);
  // factor scores parsed from categories_json
  strictEqual(payload.qscore.factor_scores.length, 2);
  strictEqual(payload.qscore.factor_scores[0].name, "value");
});

test("buildGroundingPayload: revenue reported in USD millions, oldest→newest", () => {
  const { payload } = buildGroundingPayload(inputs());
  strictEqual(payload.fundamentals.revenue_usd_m[0], 366000);
  strictEqual(payload.fundamentals.revenue_usd_m[4], 416000);
});

// ─── hash-churn guard (the cost-critical invariant) ────────────────────────
test("input_hash is stable under a ≤1% daily price move", () => {
  const base = buildGroundingPayload(inputs({ snapshot: { price: 210 } }));
  const nudged = buildGroundingPayload(inputs({ snapshot: { price: 211.9 } })); // +0.9%
  strictEqual(nudged.inputHash, base.inputHash, "small price noise must not churn the hash");
});

test("input_hash changes when the score band changes", () => {
  const base = buildGroundingPayload(inputs({ snapshot: { composite: 73 } }));
  const promoted = buildGroundingPayload(inputs({ snapshot: { composite: 85 } }));
  notStrictEqual(promoted.inputHash, base.inputHash);
  strictEqual(promoted.scoreBand, "80-89");
});

test("input_hash changes when fundamentals change (new filing)", () => {
  const base = buildGroundingPayload(inputs());
  const withNewFiling = buildGroundingPayload(
    inputs({
      fundamentals: [
        fy("2022", { revenue: 394e9 }),
        fy("2023", { revenue: 383e9 }),
        fy("2024", { revenue: 391e9 }),
        fy("2025", { revenue: 416e9, eps_diluted: 6.75, shares_diluted: 15e9 }),
        fy("2026", { revenue: 450e9, eps_diluted: 7.4, shares_diluted: 14.8e9 }),
      ],
    })
  );
  notStrictEqual(withNewFiling.inputHash, base.inputHash);
});

test("stableHash: order-independent, deterministic", () => {
  strictEqual(stableHash({ a: 1, b: 2 }), stableHash({ b: 2, a: 1 }));
  notStrictEqual(stableHash({ a: 1 }), stableHash({ a: 2 }));
});

// ─── degenerate input ──────────────────────────────────────────────────────
test("buildGroundingPayload: tolerates missing fundamentals", () => {
  const { payload } = buildGroundingPayload(inputs({ fundamentals: [] }));
  strictEqual(payload.valuation.pe_ratio, null);
  strictEqual(payload.fundamentals.latest_fiscal_year, null);
  deepStrictEqual(payload.fundamentals.revenue_usd_m, []);
});
