import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { scoreRsi } from "./zscore";

test("scoreRsi: null / undefined / non-finite → null", () => {
  strictEqual(scoreRsi(null), null);
  strictEqual(scoreRsi(undefined), null);
  strictEqual(scoreRsi(NaN), null);
  strictEqual(scoreRsi(Infinity), null);
  strictEqual(scoreRsi(-Infinity), null);
});

test("scoreRsi: oversold (RSI < 30) returns flat 60", () => {
  strictEqual(scoreRsi(0), 60);
  strictEqual(scoreRsi(15), 60);
  strictEqual(scoreRsi(29.99), 60);
});

test("scoreRsi: continuous at RSI=30 boundary (was a 10-point cliff pre-fix)", () => {
  strictEqual(scoreRsi(30), 60);
});

test("scoreRsi: smooth gradient 60→50 across RSI 30–50 (was a flat dead zone pre-fix)", () => {
  strictEqual(scoreRsi(30), 60);
  strictEqual(scoreRsi(40), 55);
  strictEqual(scoreRsi(50), 50);
});

test("scoreRsi: gradient 50→88 across RSI 50–70", () => {
  strictEqual(scoreRsi(50), 50);
  strictEqual(scoreRsi(60), 69);
  strictEqual(scoreRsi(70), 88);
});

test("scoreRsi: gradient 88→70 across RSI 70–80 (overbought rolloff)", () => {
  strictEqual(scoreRsi(70), 88);
  strictEqual(scoreRsi(75), 79);
  strictEqual(scoreRsi(80), 70);
});

test("scoreRsi: gradient 70→20 above RSI 80, floored at 20", () => {
  strictEqual(scoreRsi(80), 70);
  strictEqual(scoreRsi(90), 45);
  strictEqual(scoreRsi(100), 20);
  strictEqual(scoreRsi(150), 20); // out-of-range still clamps
});
