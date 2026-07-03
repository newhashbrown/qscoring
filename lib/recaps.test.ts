import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import { analyzeWeek, type SnapshotFile } from "./recaps";
import type { ScoreboardPick } from "@/data/categories";

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

function pick(ticker: string, price: number, composite = 50): ScoreboardPick {
  return {
    ticker,
    companyName: `${ticker} Inc`,
    price,
    changePercent: 0,
    composite,
    signal: "BUY_LONG_TERM",
    confidence: "MEDIUM",
    categories: [],
  };
}

function snapFile(picks: ScoreboardPick[]): SnapshotFile {
  return { generatedAt: "2026-06-30T13:30:00Z", picks };
}

test("analyzeWeek: raw forward returns without a split factor", () => {
  const start = snapFile([pick("A", 100)]);
  const end = snapFile([pick("A", 105)]);
  const recap = analyzeWeek(start, "2026-06-30", end, "2026-07-03");
  strictEqual(recap.rowCount, 1);
  strictEqual(approx(recap.rows[0].forwardReturn, 0.05), true);
  strictEqual(recap.rows[0].basisAdjusted, undefined);
});

test("analyzeWeek: split factor corrects the phantom and flags the row (#76)", () => {
  // CRWD-shaped: 4:1 split mid-week. Frozen entry 763.14 (old basis), end
  // snapshot 193 (new basis). Raw join → −74.7% phantom "worst mover".
  const start = snapFile([pick("A", 100), pick("CRWD", 763.14)]);
  const end = snapFile([pick("A", 105), pick("CRWD", 193)]);
  const splitFactor = (t: string) => (t === "CRWD" ? 4 : 1);
  const recap = analyzeWeek(start, "2026-06-30", end, "2026-07-03", { splitFactor });

  const crwd = recap.rows.find((r) => r.ticker === "CRWD")!;
  strictEqual(approx(crwd.forwardReturn, (193 * 4) / 763.14 - 1), true); // ~+1.2%
  strictEqual(crwd.forwardReturn > 0, true);
  strictEqual(crwd.basisAdjusted, true);
  strictEqual(crwd.signalCorrect, true); // BUY + up = correct, not a fake miss

  // A is untouched and unflagged.
  const a = recap.rows.find((r) => r.ticker === "A")!;
  strictEqual(approx(a.forwardReturn, 0.05), true);
  strictEqual(a.basisAdjusted, undefined);

  // The phantom must not dominate worstMovers anymore.
  strictEqual(recap.worstMovers.some((r) => r.forwardReturn < -0.5), false);
});
