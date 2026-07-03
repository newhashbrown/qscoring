import { test } from "node:test";
import { strictEqual } from "node:assert/strict";
import {
  splitFactor,
  toLedgerBasisFactor,
  splitFactorForStore,
  detectLedgerBoundary,
  type SplitEvent,
  type SplitStore,
} from "./splits";

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// CRWD's real shape: FMP effective 2026-07-02, but the ledger's basis boundary
// is 2026-07-01 (the as-of rebuilt snapshot already carries adjusted prices).
const CRWD: SplitEvent[] = [
  { date: "2026-07-01", numerator: 4, denominator: 1, fmpDate: "2026-07-02" },
];

// ─── splitFactor (ledger-boundary rule) ──────────────────────
test("splitFactor: no events → 1", () => {
  strictEqual(splitFactor([], "2026-06-30", "2026-07-03"), 1);
});

test("splitFactor: boundary inside (entry, exit] → ratio applied", () => {
  // Entry 06-30 froze the OLD basis; exit 07-03 is NEW basis → adjust by 4.
  strictEqual(splitFactor(CRWD, "2026-06-30", "2026-07-03"), 4);
});

test("splitFactor: entry ON the boundary is already new basis → 1", () => {
  // The 07-01 snapshot froze post-split prices; adjusting it would fabricate
  // a phantom gain the other way.
  strictEqual(splitFactor(CRWD, "2026-07-01", "2026-07-03"), 1);
});

test("splitFactor: window entirely before the boundary → 1", () => {
  strictEqual(splitFactor(CRWD, "2026-06-15", "2026-06-30"), 1);
});

test("splitFactor: exit exactly at the boundary → ratio applied", () => {
  strictEqual(splitFactor(CRWD, "2026-06-30", "2026-07-01"), 4);
});

test("splitFactor: reverse split uses fractional ratio", () => {
  const rev: SplitEvent[] = [{ date: "2026-07-01", numerator: 1, denominator: 9 }];
  strictEqual(approx(splitFactor(rev, "2026-06-30", "2026-07-03"), 1 / 9), true);
});

test("splitFactor: multiple straddled splits compound", () => {
  const events: SplitEvent[] = [
    { date: "2026-06-20", numerator: 2, denominator: 1 },
    { date: "2026-07-01", numerator: 4, denominator: 1 },
  ];
  strictEqual(splitFactor(events, "2026-06-15", "2026-07-03"), 8);
  // Window covering only the second split compounds only it.
  strictEqual(splitFactor(events, "2026-06-25", "2026-07-03"), 4);
});

test("splitFactor: malformed ratios are skipped, never poison the factor", () => {
  const events: SplitEvent[] = [
    { date: "2026-07-01", numerator: 0, denominator: 1 },
    { date: "2026-07-01", numerator: 4, denominator: 0 },
    { date: "2026-07-01", numerator: NaN, denominator: 1 },
  ];
  strictEqual(splitFactor(events, "2026-06-30", "2026-07-03"), 1);
});

// ─── toLedgerBasisFactor (fetched adjusted bar → ledger basis) ──
// Every bar fetched from FMP adjusted history is on the NEWEST basis; the
// ledger's basis at a date flips at the ledger boundary. Converting a fetched
// bar to the ledger's basis multiplies by every split boundary after the bar.
test("toLedgerBasisFactor: bar before the boundary → ledger is old basis → ×ratio", () => {
  strictEqual(toLedgerBasisFactor(CRWD, "2026-06-25"), 4);
  strictEqual(toLedgerBasisFactor(CRWD, "2026-06-30"), 4);
});

test("toLedgerBasisFactor: bar on/after the boundary → ledger already new basis → 1", () => {
  // 07-01 is CRWD's ledger boundary (the rebuilt snapshot froze adjusted
  // prices) even though the session traded pre-split — the store must match
  // the LEDGER's basis, not the tape's.
  strictEqual(toLedgerBasisFactor(CRWD, "2026-07-01"), 1);
  strictEqual(toLedgerBasisFactor(CRWD, "2026-07-03"), 1);
});

test("toLedgerBasisFactor: compounds multiple later boundaries", () => {
  const events: SplitEvent[] = [
    { date: "2026-06-20", numerator: 2, denominator: 1, fmpDate: "2026-06-21" },
    { date: "2026-07-01", numerator: 4, denominator: 1, fmpDate: "2026-07-02" },
  ];
  strictEqual(toLedgerBasisFactor(events, "2026-06-10"), 8);
  strictEqual(toLedgerBasisFactor(events, "2026-06-25"), 4);
});

test("toLedgerBasisFactor: round-trips with splitFactor for an exit-store join", () => {
  // Name leaves the universe; exit-store bar for E=07-01 stays adjusted (~193,
  // ledger new basis), and the ledger join from an 06-30 old-basis entry then
  // applies the boundary factor — honest end to end.
  const entry = 763.14; // frozen 06-30
  const fetchedAdjClose = 193; // FMP adjusted bar for 07-01, fetched later
  const stored = fetchedAdjClose * toLedgerBasisFactor(CRWD, "2026-07-01"); // ×1
  const f = splitFactor(CRWD, "2026-06-30", "2026-07-01"); // ×4
  const ret = (stored * f) / entry - 1;
  strictEqual(ret > -0.05 && ret < 0.05, true);
});

// ─── detectLedgerBoundary (the store's correctness gate) ─────
test("detectLedgerBoundary: finds the boundary a session BEFORE the FMP date (CRWD rebuild shape)", () => {
  // 06-30 froze 763.14 old basis; the rebuilt 07-01 froze adjusted ~193 —
  // one session before FMP's official 07-02.
  const series: Array<[string, number]> = [
    ["2026-06-29", 742.91],
    ["2026-06-30", 763.14],
    ["2026-07-01", 193.19],
  ];
  const r = detectLedgerBoundary(series, "2026-07-02", 4);
  strictEqual(r.boundary, "2026-07-01");
  strictEqual(r.scanned, true);
});

test("detectLedgerBoundary: finds the boundary AFTER the FMP date (weekend/holiday lag)", () => {
  const series: Array<[string, number]> = [
    ["2026-06-30", 100],
    ["2026-07-06", 25.3], // first snapshot after a 07-02 split lands days later
  ];
  const r = detectLedgerBoundary(series, "2026-07-02", 4);
  strictEqual(r.boundary, "2026-07-06");
});

test("detectLedgerBoundary: HON refusal — scanned prices show no re-basing → null + scanned", () => {
  // FMP reported a 1:2 for HON @ 06-29 that never moved the frozen prices.
  const series: Array<[string, number]> = [
    ["2026-06-25", 231.24],
    ["2026-06-29", 227.8],
    ["2026-06-30", 223.9],
  ];
  const r = detectLedgerBoundary(series, "2026-06-29", 0.5);
  strictEqual(r.boundary, null);
  strictEqual(r.scanned, true); // positive evidence — caller must REFUSE the event
});

test("detectLedgerBoundary: name absent around the split → not scanned (fallback-eligible)", () => {
  const series: Array<[string, number]> = [
    ["2026-05-05", 80],
    ["2026-05-06", 81], // left the universe long before the 07-02 split
  ];
  const r = detectLedgerBoundary(series, "2026-07-02", 4);
  strictEqual(r.boundary, null);
  strictEqual(r.scanned, false);
});

test("detectLedgerBoundary: reverse split (price jumps UP) detects too", () => {
  const series: Array<[string, number]> = [
    ["2026-06-24", 46.1],
    ["2026-06-25", 137.8], // 1:3 → ×3
  ];
  const r = detectLedgerBoundary(series, "2026-06-24", 1 / 3);
  strictEqual(r.boundary, "2026-06-25");
});

test("detectLedgerBoundary: organic drift inside the window is NOT mistaken for a small split", () => {
  // A +12% real move must stay closer to "no split" than to a 4:1 ratio.
  const series: Array<[string, number]> = [
    ["2026-06-30", 100],
    ["2026-07-01", 112],
  ];
  const r = detectLedgerBoundary(series, "2026-07-01", 4);
  strictEqual(r.boundary, null);
  strictEqual(r.scanned, true);
});

test("detectLedgerBoundary: non-finite/zero prices are skipped, not matched", () => {
  const series: Array<[string, number]> = [
    ["2026-06-30", 100],
    ["2026-07-01", 0],
    ["2026-07-02", 25],
  ];
  // 100→0 is skipped; 0→25 is skipped (observed 0); nothing detectable.
  const r = detectLedgerBoundary(series, "2026-07-01", 4);
  strictEqual(r.boundary, null);
  strictEqual(r.scanned, true);
});

// ─── splitFactorForStore ─────────────────────────────────────
test("splitFactorForStore: unknown ticker → 1; known ticker → boundary rule", () => {
  const store: SplitStore = { CRWD };
  strictEqual(splitFactorForStore(store, "AAPL", "2026-06-30", "2026-07-03"), 1);
  strictEqual(splitFactorForStore(store, "CRWD", "2026-06-30", "2026-07-03"), 4);
});

// ─── worked example: the phantom this module exists to kill ──
test("CRWD phantom: old-basis entry joins new-basis exit at an honest return", () => {
  // 06-30 froze 763.14; 07-03 snapshot carries ~192. Raw join → −74.8% phantom.
  const entry = 763.14;
  const exit = 192.2;
  const raw = exit / entry - 1;
  strictEqual(raw < -0.7, true);
  const f = splitFactor(CRWD, "2026-06-30", "2026-07-03");
  const honest = (exit * f) / entry - 1;
  strictEqual(honest > -0.05 && honest < 0.05, true); // a normal few-day move
});
