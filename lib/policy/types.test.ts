import { test } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import {
  parsePolicyExposures,
  parsePolicyToolOutput,
  mergeToolUseInputs,
  degenerateReason,
  isDegenerate,
  POLICY_TAG_KEYS,
  levelField,
  rationaleField,
  type PolicyExposures,
  type PolicyLevel,
} from "./types";

/** A valid FLAT tool output (12 fields): all-none + tariffs=high, distinct rationales. */
function flatSample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const k of POLICY_TAG_KEYS) {
    flat[levelField(k)] = "none";
    flat[rationaleField(k)] = `distinct rationale for ${k}`;
  }
  flat[levelField("tariffs")] = "high";
  return { ...flat, ...overrides };
}

// A well-formed, differentiated classification (the happy path).
function make(overrides: Partial<Record<string, { level: PolicyLevel; rationale: string }>> = {}): PolicyExposures {
  const base: Record<string, { level: PolicyLevel; rationale: string }> = {
    tariffs: { level: "high", rationale: "Imports hardware components subject to import duties." },
    drug_pricing: { level: "none", rationale: "Not a healthcare or pharmaceutical business." },
    tax_policy: { level: "medium", rationale: "Large foreign earnings sensitive to corporate tax changes." },
    energy_regulation: { level: "low", rationale: "Energy is an input cost but not a core driver." },
    antitrust: { level: "high", rationale: "Dominant platform under active competition scrutiny." },
    china_supply_chain: { level: "medium", rationale: "Meaningful manufacturing exposure to China." },
  };
  return { ...base, ...overrides } as PolicyExposures;
}

test("parsePolicyExposures: accepts a well-formed classification", () => {
  const p = parsePolicyExposures(make());
  ok(p !== null);
  strictEqual(p?.tariffs.level, "high");
  strictEqual(POLICY_TAG_KEYS.every((k) => p![k] !== undefined), true);
});

test("parsePolicyExposures: strips unknown keys, keeps the six tags", () => {
  const p = parsePolicyExposures({ ...make(), bogus_theme: { level: "high", rationale: "x y z" } });
  ok(p !== null);
  strictEqual("bogus_theme" in (p as object), false);
});

test("parsePolicyExposures: rejects a missing tag", () => {
  const obj = make() as Record<string, unknown>;
  delete obj.antitrust;
  strictEqual(parsePolicyExposures(obj), null);
});

test("parsePolicyExposures: rejects an invalid level enum", () => {
  strictEqual(parsePolicyExposures(make({ tariffs: { level: "severe" as PolicyLevel, rationale: "x y z" } })), null);
});

test("parsePolicyExposures: rejects an empty rationale", () => {
  strictEqual(parsePolicyExposures(make({ tariffs: { level: "high", rationale: "" } })), null);
});

test("parsePolicyExposures: rejects a non-object", () => {
  strictEqual(parsePolicyExposures("nope"), null);
  strictEqual(parsePolicyExposures(null), null);
});

// ─── flat tool output → nested reassembly (the Haiku-serialization fix) ──────
test("parsePolicyToolOutput: reassembles 12 flat fields into nested exposures", () => {
  const { value, error } = parsePolicyToolOutput(flatSample());
  strictEqual(error, null);
  ok(value !== null);
  strictEqual(value?.tariffs.level, "high");
  strictEqual(value?.drug_pricing.level, "none");
  strictEqual(value?.tariffs.rationale, "distinct rationale for tariffs");
  strictEqual(POLICY_TAG_KEYS.every((k) => value![k]?.level !== undefined), true);
});

test("parsePolicyToolOutput: normalizes level casing/whitespace (AAPL's reject case)", () => {
  const { value } = parsePolicyToolOutput(flatSample({ [levelField("antitrust")]: "  HIGH " }));
  strictEqual(value?.antitrust.level, "high");
});

test("parsePolicyToolOutput: strips unknown scaffolding keys, keeps the 12 fields", () => {
  const { value } = parsePolicyToolOutput(flatSample({ "<parameter name=\"level\">": "medium" }));
  ok(value !== null);
});

test("parsePolicyToolOutput: fails with a zod error when a flat field is missing", () => {
  const flat = flatSample();
  delete flat[rationaleField("energy_regulation")];
  const { value, error } = parsePolicyToolOutput(flat);
  strictEqual(value, null);
  ok(error !== null && error.issues.length > 0);
});

test("parsePolicyToolOutput: rejects an invalid level enum", () => {
  const { value } = parsePolicyToolOutput(flatSample({ [levelField("tariffs")]: "severe" }));
  strictEqual(value, null);
});

test("mergeToolUseInputs: merges fields split across multiple tool_use blocks", () => {
  const half1: Record<string, unknown> = {};
  const half2: Record<string, unknown> = {};
  POLICY_TAG_KEYS.forEach((k, i) => {
    const target = i < 3 ? half1 : half2;
    target[levelField(k)] = "low";
    target[rationaleField(k)] = `reason ${k}`;
  });
  const merged = mergeToolUseInputs([
    { type: "text" },
    { type: "tool_use", input: half1 },
    { type: "tool_use", input: half2 },
  ]);
  const { value } = parsePolicyToolOutput(merged);
  ok(value !== null);
  strictEqual(POLICY_TAG_KEYS.every((k) => value![k]?.level === "low"), true);
});

// ─── degeneracy guard (replaces the numeric guardrail for categorical output) ─
test("degenerateReason: null for a differentiated classification", () => {
  strictEqual(degenerateReason(make()), null);
  strictEqual(isDegenerate(make()), false);
});

test("degenerateReason: flags all-high (uniform non-none level)", () => {
  const all = Object.fromEntries(
    POLICY_TAG_KEYS.map((k, i) => [k, { level: "high" as PolicyLevel, rationale: `distinct reason number ${i}` }])
  ) as PolicyExposures;
  ok(degenerateReason(all)?.includes("identical"));
});

test("degenerateReason: does NOT flag all-none with distinct rationales (legit unexposed co.)", () => {
  const all = Object.fromEntries(
    POLICY_TAG_KEYS.map((k, i) => [k, { level: "none" as PolicyLevel, rationale: `distinct reason number ${i}` }])
  ) as PolicyExposures;
  strictEqual(degenerateReason(all), null);
});

test("degenerateReason: flags a copy-pasted rationale reused across tags", () => {
  const dup = Object.fromEntries(
    POLICY_TAG_KEYS.map((k) => [k, { level: "low" as PolicyLevel, rationale: "no material exposure here" }])
  ) as PolicyExposures;
  // uniform level 'low' would trip the level rule; make levels vary but rationale identical
  dup.tariffs.level = "high";
  dup.antitrust.level = "medium";
  ok(degenerateReason(dup)?.includes("rationale"));
});
