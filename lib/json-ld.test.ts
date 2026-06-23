import { test } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert/strict";
import { safeJsonLdString } from "./json-ld";

test("safeJsonLdString: neutralizes a </script> breakout in a string field", () => {
  // The M1 vector: an FMP companyName that closes the ld+json block.
  const out = safeJsonLdString({ name: "Evil</script><script>alert(1)</script>" });
  ok(!out.includes("</script>"), "raw </script> must not survive");
  ok(!out.includes("<script>"), "raw <script> must not survive");
  ok(out.includes("\\u003c/script\\u003e"), "should emit the escaped form");
});

test("safeJsonLdString: escapes <, >, and & everywhere", () => {
  const out = safeJsonLdString({ a: "<", b: ">", c: "&", d: "a<b>c&d" });
  ok(!/[<>&]/.test(out), "no raw <, >, or & should remain");
  ok(out.includes("\\u003c") && out.includes("\\u003e") && out.includes("\\u0026"));
});

test("safeJsonLdString: output is JSON.parse-equivalent to the input", () => {
  // The escapes must decode back to the original characters (no data loss).
  const value = {
    "@context": "https://schema.org",
    name: "AT&T Inc. <Holdings>",
    tickers: ["T", "BRK-B"],
    nested: { note: "5 > 3 && 2 < 4" },
  };
  deepStrictEqual(JSON.parse(safeJsonLdString(value)), value);
});

test("safeJsonLdString: leaves clean data byte-identical except for &<>", () => {
  const value = { name: "Apple Inc.", ticker: "AAPL" };
  strictEqual(safeJsonLdString(value), JSON.stringify(value));
});
