import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildScoreHistory,
  mostRecentSignalChange,
  type RawSnapshotRow,
  type ScoreHistoryPoint,
} from "./score-history";

function fixtureRows(name: string): RawSnapshotRow[] {
  const url = new URL(`./scoring/__fixtures__/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf-8")) as RawSnapshotRow[];
}

function point(date: string, signal: string): ScoreHistoryPoint {
  return { date, signal, composite: 50, factors: { value: null, growth: null, momentum: null, profitability: null, risk: null } };
}

// ─── buildScoreHistory (fixture-backed) ──────────────────────
test("buildScoreHistory: sorts ascending, parses factors + composite", () => {
  const h = buildScoreHistory(fixtureRows("score-snapshots-history.json"));
  deepStrictEqual(
    h.points.map((p) => p.date),
    ["2026-05-08", "2026-05-11", "2026-05-12"]
  );
  strictEqual(h.points[0].composite, 58);
  strictEqual(h.points[0].factors.value, 41);
  strictEqual(h.points[0].factors.momentum, 62);
});

test("buildScoreHistory: reports the most recent signal change", () => {
  // Fixture flips BUY_SHORT_TERM → HOLD (05-11) → BUY_SHORT_TERM (05-12).
  const h = buildScoreHistory(fixtureRows("score-snapshots-history.json"));
  deepStrictEqual(h.lastSignalChange, {
    date: "2026-05-12",
    from: "HOLD",
    to: "BUY_SHORT_TERM",
  });
});

test("buildScoreHistory: malformed categories_json → null factors, composite still kept", () => {
  const rows: RawSnapshotRow[] = [
    { snapshot_date: "2026-05-01", composite: 60, signal: "HOLD", categories_json: "not json" },
  ];
  const h = buildScoreHistory(rows);
  strictEqual(h.points[0].composite, 60);
  strictEqual(h.points[0].factors.value, null);
});

test("buildScoreHistory: drops rows with non-finite composite", () => {
  const rows = [
    { snapshot_date: "2026-05-01", composite: NaN as unknown as number, signal: "HOLD", categories_json: "[]" },
    { snapshot_date: "2026-05-02", composite: 55, signal: "HOLD", categories_json: "[]" },
  ];
  strictEqual(buildScoreHistory(rows).points.length, 1);
});

// ─── mostRecentSignalChange ──────────────────────────────────
test("mostRecentSignalChange: returns the latest transition, not the first", () => {
  const pts = [
    point("2026-05-01", "HOLD"),
    point("2026-05-02", "BUY_LONG_TERM"), // first change
    point("2026-05-03", "BUY_LONG_TERM"),
    point("2026-05-04", "SHORT"), // most recent change
  ];
  deepStrictEqual(mostRecentSignalChange(pts), {
    date: "2026-05-04",
    from: "BUY_LONG_TERM",
    to: "SHORT",
  });
});

test("mostRecentSignalChange: stable signal → null", () => {
  strictEqual(
    mostRecentSignalChange([point("2026-05-01", "HOLD"), point("2026-05-02", "HOLD")]),
    null
  );
});

test("mostRecentSignalChange: single / empty series → null", () => {
  strictEqual(mostRecentSignalChange([point("2026-05-01", "HOLD")]), null);
  strictEqual(mostRecentSignalChange([]), null);
});
