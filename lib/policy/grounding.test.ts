import { test } from "node:test";
import { strictEqual, ok, notStrictEqual } from "node:assert/strict";
import { buildPolicyPayload, MAX_DESCRIPTION_CHARS } from "./grounding";

const base = {
  ticker: "AAPL",
  companyName: "Apple Inc.",
  sector: "Technology",
  industry: "Consumer Electronics",
  description: "Designs and sells consumer hardware and services worldwide.",
};

test("buildPolicyPayload: shapes the payload from profile fields", () => {
  const { payload } = buildPolicyPayload(base);
  strictEqual(payload.ticker, "AAPL");
  strictEqual(payload.sector, "Technology");
  strictEqual(payload.industry, "Consumer Electronics");
  ok(payload.business_description?.startsWith("Designs and sells"));
});

test("buildPolicyPayload: blanks empty strings to null", () => {
  const { payload } = buildPolicyPayload({ ...base, sector: "  ", description: "" });
  strictEqual(payload.sector, null);
  strictEqual(payload.business_description, null);
});

test("buildPolicyPayload: caps an oversized description", () => {
  const { payload } = buildPolicyPayload({ ...base, description: "x".repeat(5000) });
  strictEqual(payload.business_description?.length, MAX_DESCRIPTION_CHARS);
});

test("input_hash is stable across identical profiles", () => {
  strictEqual(buildPolicyPayload(base).inputHash, buildPolicyPayload({ ...base }).inputHash);
});

test("input_hash ignores company_name (a rename shouldn't churn regen)", () => {
  strictEqual(
    buildPolicyPayload(base).inputHash,
    buildPolicyPayload({ ...base, companyName: "Apple Incorporated" }).inputHash
  );
});

test("input_hash changes when sector/industry/description change", () => {
  const h0 = buildPolicyPayload(base).inputHash;
  notStrictEqual(h0, buildPolicyPayload({ ...base, sector: "Healthcare" }).inputHash);
  notStrictEqual(h0, buildPolicyPayload({ ...base, description: "Now a biotech firm." }).inputHash);
});
