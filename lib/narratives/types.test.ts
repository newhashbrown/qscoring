import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { parseNarrative } from "./types";

// A well-formed narrative with proper array fields (the happy path).
const base = {
  financial_health: "Revenue grew steadily with expanding margins over the window.",
  competitive_position: "A durable franchise with a defensible cost position.",
  factor_macro_profile: "Above-market beta with a growth and profitability tilt.",
  risk_flags: ["Elevated leverage", "Margin compression risk"],
  catalyst_watch: ["Next annual filing", "Debt-level trend"],
  one_line_summary: "A high-margin large cap with above-market sensitivity.",
};

test("parseNarrative: accepts a well-formed narrative", () => {
  const n = parseNarrative(base);
  deepStrictEqual(n?.risk_flags, ["Elevated leverage", "Margin compression risk"]);
});

// ─── list-field coercion (the real failure mode from Haiku tool output) ──────
test("parseNarrative: coerces a newline-delimited STRING to string[]", () => {
  const n = parseNarrative({ ...base, risk_flags: "Elevated leverage\nMargin compression risk\n- High beta" });
  deepStrictEqual(n?.risk_flags, ["Elevated leverage", "Margin compression risk", "High beta"]);
});

test("parseNarrative: coerces a semicolon-delimited string", () => {
  const n = parseNarrative({ ...base, catalyst_watch: "Next filing; Margin trend; Debt levels" });
  deepStrictEqual(n?.catalyst_watch, ["Next filing", "Margin trend", "Debt levels"]);
});

test("parseNarrative: coerces a JSON-array string", () => {
  const n = parseNarrative({ ...base, risk_flags: '["Leverage", "Beta"]' });
  deepStrictEqual(n?.risk_flags, ["Leverage", "Beta"]);
});

test("parseNarrative: coerces an array of objects to strings", () => {
  const n = parseNarrative({
    ...base,
    risk_flags: [{ flag: "Elevated leverage" }, { text: "Margin risk" }],
  });
  deepStrictEqual(n?.risk_flags, ["Elevated leverage", "Margin risk"]);
});

test("parseNarrative: a MISSING list field defaults to [] (does not fail)", () => {
  const { catalyst_watch: _omit, ...noCatalyst } = base;
  const n = parseNarrative(noCatalyst);
  strictEqual(n !== null, true);
  deepStrictEqual(n?.catalyst_watch, []);
});

test("parseNarrative: unknown extra keys are stripped, not rejected", () => {
  const n = parseNarrative({ ...base, ticker: "AAPL", extra: 123 });
  strictEqual(n !== null, true);
  strictEqual("ticker" in (n as object), false);
});

// ─── still rejects genuinely broken output ───────────────────────────────────
test("parseNarrative: rejects when a required paragraph is missing", () => {
  const { financial_health: _omit, ...broken } = base;
  strictEqual(parseNarrative(broken), null);
});

test("parseNarrative: rejects a non-object", () => {
  strictEqual(parseNarrative("not a narrative"), null);
  strictEqual(parseNarrative(null), null);
});
