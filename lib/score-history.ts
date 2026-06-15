/**
 * QScore history reconstruction (Phase 3 / Tier 2).
 *
 * Rebuilds a ticker's composite + five-factor score series from the
 * append-only snapshot ledger — specifically the D1 `score_snapshots`
 * projection (migrations/0004), which is the per-ticker-queryable mirror of
 * data/snapshots/*.json. No new FMP data: every point below was committed at
 * its snapshot date, so the series is no-look-ahead by construction.
 *
 * Pure functions only (rows in → series out) so reconstruction + signal-change
 * detection are unit-testable without D1; the route does the query.
 */

export type FactorName = "value" | "growth" | "momentum" | "profitability" | "risk";

export const FACTOR_NAMES: readonly FactorName[] = [
  "value",
  "growth",
  "momentum",
  "profitability",
  "risk",
];

// Raw row shape from `score_snapshots`. categories_json is the serialized
// CategoryScore[] ({name,label,score}); composite/signal are columns.
export type RawSnapshotRow = {
  snapshot_date: string;
  composite: number;
  signal: string;
  categories_json: string;
};

export type ScoreHistoryPoint = {
  date: string;
  composite: number;
  signal: string;
  factors: Record<FactorName, number | null>;
};

export type SignalChange = { date: string; from: string; to: string };

export type ScoreHistory = {
  points: ScoreHistoryPoint[]; // ascending by date
  lastSignalChange: SignalChange | null;
};

function emptyFactors(): Record<FactorName, number | null> {
  return { value: null, growth: null, momentum: null, profitability: null, risk: null };
}

function parseFactors(categoriesJson: string): Record<FactorName, number | null> {
  const factors = emptyFactors();
  try {
    const arr = JSON.parse(categoriesJson) as unknown;
    if (!Array.isArray(arr)) return factors;
    for (const c of arr) {
      if (!c || typeof c !== "object") continue;
      const name = (c as { name?: unknown }).name;
      const score = (c as { score?: unknown }).score;
      if (typeof name === "string" && name in factors && typeof score === "number" && Number.isFinite(score)) {
        factors[name as FactorName] = score;
      }
    }
  } catch {
    // Malformed JSON → leave all factors null; the composite line still renders.
  }
  return factors;
}

/**
 * Most recent date at which the signal differs from the prior snapshot's.
 * Walks ascending and keeps the LAST transition, so the result is the newest
 * signal change in the series. null when the signal never changed.
 */
export function mostRecentSignalChange(points: readonly ScoreHistoryPoint[]): SignalChange | null {
  let change: SignalChange | null = null;
  for (let i = 1; i < points.length; i++) {
    if (points[i].signal !== points[i - 1].signal) {
      change = { date: points[i].date, from: points[i - 1].signal, to: points[i].signal };
    }
  }
  return change;
}

export function buildScoreHistory(rows: readonly RawSnapshotRow[]): ScoreHistory {
  const points = rows
    .filter((r) => r && typeof r.snapshot_date === "string" && Number.isFinite(Number(r.composite)))
    .map((r) => ({
      date: r.snapshot_date,
      composite: Number(r.composite),
      signal: String(r.signal),
      factors: parseFactors(r.categories_json),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { points, lastSignalChange: mostRecentSignalChange(points) };
}
