import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ScoreboardPick } from "@/data/categories";
import type { SizeBucket } from "./types";

/**
 * Backward-compatibility fixtures for the Tier 1a `header` field.
 *
 * `header` is optional: snapshots committed before the Phase-1 pipeline change
 * have no header, and forward snapshots do (we do NOT destructively backfill
 * historical files). These fixtures lock in that every consumer must tolerate
 * an absent header — the regression risk introduced by making the field
 * optional — using the same on-disk-JSON shape the real snapshots use.
 */

function loadFixture(name: string): ScoreboardPick {
  const url = new URL(`./__fixtures__/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf-8")) as ScoreboardPick;
}

// A safe accessor of the kind any header-aware consumer should use.
function readSizeBucket(pick: ScoreboardPick): SizeBucket | null {
  return pick.header?.sizeBucket ?? null;
}

test("historical snapshot pick (pre-Phase-1) has no header and reads safely", () => {
  const pick = loadFixture("snapshot-pick-historical.json");
  strictEqual(pick.header, undefined);
  strictEqual(readSizeBucket(pick), null); // degrades, does not throw
  strictEqual(pick.categories.length, 5); // existing five-factor data intact
});

test("forward snapshot pick carries the header scalars", () => {
  const pick = loadFixture("snapshot-pick-with-header.json");
  strictEqual(readSizeBucket(pick), "mega");
  strictEqual(pick.header?.week52High, 317.4);
  strictEqual(pick.header?.sharesOutstanding, 14687356000);
  strictEqual(pick.categories.length, 5); // header is additive, factors unchanged
});
