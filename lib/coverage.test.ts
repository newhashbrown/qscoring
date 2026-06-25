import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { classifyCoverage } from "./coverage";

const BIG = 5_000_000_000; // comfortably above the $2B floor

test("classifyCoverage: ETFs and funds are not scored", () => {
  strictEqual(classifyCoverage({ isEtf: true, marketCap: BIG }).state, "do_not_score");
  strictEqual(classifyCoverage({ isFund: true, marketCap: BIG }).state, "do_not_score");
});

test("classifyCoverage: SPACs / shells are not scored", () => {
  strictEqual(
    classifyCoverage({ industry: "Shell Companies", marketCap: BIG, confidence: "HIGH" }).state,
    "do_not_score"
  );
  strictEqual(
    classifyCoverage({ industry: "Blank Check / SPAC", marketCap: BIG, confidence: "HIGH" }).state,
    "do_not_score"
  );
});

test("classifyCoverage: a non-trading (delisted/halted) security is not scored", () => {
  strictEqual(
    classifyCoverage({ isActivelyTrading: false, marketCap: BIG, confidence: "HIGH" }).state,
    "do_not_score"
  );
});

test("classifyCoverage: LOW confidence (newly listed / pre-revenue) → insufficient data", () => {
  strictEqual(
    classifyCoverage({ marketCap: BIG, confidence: "LOW", sector: "Healthcare" }).state,
    "insufficient_data"
  );
});

test("classifyCoverage: banks, insurers, and REITs are approximations (even when large)", () => {
  strictEqual(
    classifyCoverage({ industry: "Banks - Regional", marketCap: 50_000_000_000, confidence: "HIGH" }).state,
    "approximation"
  );
  strictEqual(
    classifyCoverage({ industry: "Insurance - Life", marketCap: BIG, confidence: "MEDIUM" }).state,
    "approximation"
  );
  strictEqual(
    classifyCoverage({ sector: "Real Estate", industry: "REIT - Retail", marketCap: BIG, confidence: "HIGH" }).state,
    "approximation"
  );
});

test("classifyCoverage: a payments name in Financial Services is NOT flagged as a bank", () => {
  // Visa-like: broad sector is financial, but the industry isn't bank/insurance.
  strictEqual(
    classifyCoverage({ sector: "Financial Services", industry: "Credit Services", marketCap: 400_000_000_000, confidence: "HIGH" }).state,
    "in_universe"
  );
});

test("classifyCoverage: sub-$2B operating company → approximation", () => {
  strictEqual(
    classifyCoverage({ industry: "Software - Application", marketCap: 800_000_000, confidence: "MEDIUM" }).state,
    "approximation"
  );
  // unknown market cap is treated as out-of-universe, not in.
  strictEqual(
    classifyCoverage({ industry: "Software - Application", marketCap: null, confidence: "HIGH" }).state,
    "approximation"
  );
});

test("classifyCoverage: non-US listing flags an approximation when country is known", () => {
  strictEqual(
    classifyCoverage({ country: "NL", industry: "Semiconductors", marketCap: BIG, confidence: "HIGH" }).state,
    "approximation"
  );
});

test("classifyCoverage: a US large-cap operating company → in reference universe", () => {
  strictEqual(
    classifyCoverage({ sector: "Technology", industry: "Consumer Electronics", marketCap: 3_000_000_000_000, country: "US", confidence: "HIGH" }).state,
    "in_universe"
  );
});
