import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import {
  extractNumbers,
  isGrounded,
  collectAllowedNumbers,
  validateNarrativeNumbers,
} from "./validate-numbers";
import type { GroundingPayload } from "./grounding";

// A hand-built payload so the allowed-number set is fully controlled.
const payload: GroundingPayload = {
  ticker: "AAPL",
  company_name: "Apple Inc.",
  data_as_of: "2026-07-07",
  units: { money: "USD millions", margins: "percent" },
  qscore: {
    composite: 73,
    band: "70-79",
    signal: "HOLD",
    confidence: "MEDIUM",
    long_term: 71,
    short_term: 68,
    universe_percentile: 82,
    factor_scores: [
      { name: "value", label: "Value", score: 41 },
      { name: "growth", label: "Growth", score: 66 },
    ],
  },
  fundamentals: {
    currency: "USD",
    fiscal_years: ["2021", "2022", "2023", "2024", "2025"],
    latest_fiscal_year: "2025",
    revenue_usd_m: [366000, 394000, 383000, 391000, 416000],
    revenue_cagr_pct: 3.2,
    eps_diluted: [5.61, 6.11, 6.13, 6.08, 6.75],
    free_cash_flow_usd_m: [93000, 111000, 99900, 109000, 112000],
    gross_margin_pct: 46.9,
    operating_margin_pct: 31.5,
    net_margin_pct: 25.3,
    total_debt_usd_m: 107000,
    cash_usd_m: 30000,
    net_debt_usd_m: 77000,
  },
  valuation: {
    market_cap_usd_m: 3010000,
    pe_ratio: 29,
    ps_ratio: 7.0,
    pb_ratio: 48.0,
    ev_to_ebitda: 22.0,
  },
  factor_profile: { market_beta: 1.18, size_beta: -0.22, value_beta: -0.35, momentum_beta: 0.1 },
};

function narrative(over: Partial<Parameters<typeof validateNarrativeNumbers>[0]> = {}) {
  return {
    financial_health: "Revenue reached $416 billion in fiscal 2025.",
    competitive_position: "A durable franchise.",
    factor_macro_profile: "Market beta of 1.18 indicates above-market sensitivity.",
    risk_flags: ["Net margin of 25.3% could compress"],
    catalyst_watch: ["Next annual filing"],
    one_line_summary: "A large-cap with a composite of 73.",
    ...over,
  };
}

// ─── extraction ────────────────────────────────────────────────────────────
test("extractNumbers: distinguishes figures from bare counts", () => {
  const toks = extractNumbers("Revenue was $416 billion, up over 5 years, a 46.9% margin.");
  const byVal = new Map(toks.map((t) => [t.value, t]));
  strictEqual(byVal.get(416)?.bareInteger, false); // has magnitude suffix
  strictEqual(byVal.get(5)?.bareInteger, true); // bare count
  strictEqual(byVal.get(46.9)?.bareInteger, false); // percent
});

// ─── category-aware scale matching ─────────────────────────────────────────
test("isGrounded: money tokens accept billion/trillion unit reformatting", () => {
  const allowed = [416000, 3010000]; // both in USD millions
  strictEqual(isGrounded(416, "money", allowed), true); // $416B == 416000M (×10^3)
  strictEqual(isGrounded(3.01, "money", allowed), true); // $3.01T == 3,010,000M (×10^6)
});

test("isGrounded: percent tokens accept fraction↔percent", () => {
  strictEqual(isGrounded(46.9, "percent", [46.9]), true); // as-is
  strictEqual(isGrounded(46.9, "percent", [0.469]), true); // fraction ×100
});

test("isGrounded: a plain number must match at its own magnitude", () => {
  const allowed = collectAllowedNumbers(payload); // includes a 0.35 beta
  strictEqual(isGrounded(35, "plain", allowed), false); // must NOT match 0.35 via ×100
  strictEqual(isGrounded(29, "plain", allowed), true); // matches pe_ratio 29
});

// ─── full validation ───────────────────────────────────────────────────────
test("validateNarrativeNumbers: clean narrative passes", () => {
  const res = validateNarrativeNumbers(narrative(), payload);
  strictEqual(res.ok, true);
  deepStrictEqual(res.offending, []);
});

test("validateNarrativeNumbers: fiscal years and small counts pass as prose", () => {
  const res = validateNarrativeNumbers(
    narrative({
      financial_health: "Across the 5 fiscal years from 2021 to 2025, margins held.",
    }),
    payload
  );
  strictEqual(res.ok, true);
});

test("validateNarrativeNumbers: a fabricated P/E is rejected", () => {
  const res = validateNarrativeNumbers(
    narrative({ competitive_position: "Shares trade at a P/E near 35, rich for the sector." }),
    payload
  );
  strictEqual(res.ok, false);
  strictEqual(res.offending.some((o) => o.value === 35 && o.section === "competitive_position"), true);
});

test("validateNarrativeNumbers: a fabricated growth rate is rejected", () => {
  const res = validateNarrativeNumbers(
    narrative({ risk_flags: ["Revenue could fall 88% in a downturn"] }),
    payload
  );
  strictEqual(res.ok, false);
  strictEqual(res.offending.some((o) => o.value === 88), true);
});

test("validateNarrativeNumbers: a real payload figure in billions passes", () => {
  const res = validateNarrativeNumbers(
    narrative({ financial_health: "Free cash flow was about $112 billion." }),
    payload
  );
  strictEqual(res.ok, true); // 112 == 112000 (millions)
});
