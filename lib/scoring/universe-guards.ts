/**
 * Build-time health checks for the investable universe. These FAIL the
 * pipeline (throw) rather than silently shipping a corrupted corpus.
 *
 * Added after a fund-contamination regression: ~53% of the scored universe was
 * mutual-fund share classes and ETFs that classified as Financial Services
 * (pushing it to 60% of names) and lacked fundamentals (universe-wide coverage
 * fell to ~49%). Each guard below would have failed that build. See
 * universe.ts for the root-cause filter these defend.
 */
import { looksLikeFundOrEtf, type ScreenerRow, type UniverseEntry } from "./universe";

// A clean universe maxes out around 17% in a single sector (Technology); the
// contamination pushed Financial Services to 60%. 30% leaves wide margin for
// legitimate sector tilts while still catching gross contamination.
export const MAX_SECTOR_SHARE = 0.3;

// Real large-caps have near-complete fundamentals (~95% in practice). The
// contaminated universe sat near 49%. A 90% floor catches contamination
// without false-tripping on the occasional genuinely-missing filing.
export const MIN_FUNDAMENTALS_COVERAGE = 0.9;

/**
 * Fail if any name in the final universe is a fund or ETF, using the SAME
 * flag-independent detector as selectUniverse (looksLikeFundOrEtf) — not just
 * FMP's isEtf/isFund flags. The old version trusted those flags and so missed
 * the 2026-06-23 contamination, where ~30 mutual funds returned isFund=false.
 * Checking the kept symbol/name (+ raw flags) catches that class decisively.
 */
export function assertNoFunds(
  universe: readonly UniverseEntry[],
  rawRows: readonly ScreenerRow[]
): void {
  const flagBySymbol = new Map<string, ScreenerRow>();
  for (const r of rawRows) {
    if (typeof r.symbol === "string") {
      flagBySymbol.set(r.symbol.trim().toUpperCase().replace(/\./g, "-"), r);
    }
  }

  const offenders: string[] = [];
  for (const entry of universe) {
    const row = flagBySymbol.get(entry.symbol);
    if (
      looksLikeFundOrEtf({
        symbol: entry.symbol,
        companyName: entry.companyName,
        isEtf: row?.isEtf,
        isFund: row?.isFund,
      })
    ) {
      offenders.push(entry.symbol);
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `Universe contains ${offenders.length} fund/ETF name(s) after filtering: ` +
        `${offenders.slice(0, 10).join(", ")}${offenders.length > 10 ? " …" : ""}. ` +
        "The fund/ETF exclusion in selectUniverse is not holding — aborting."
    );
  }
}

/**
 * Fail if any single sector exceeds `maxShare` of the universe — the headline
 * symptom of fund contamination (funds pile into Financial Services).
 */
export function assertSectorConcentration(
  sectorCounts: Record<string, number>,
  total: number,
  maxShare: number = MAX_SECTOR_SHARE
): void {
  if (total <= 0) {
    throw new Error("Cannot check sector concentration on an empty universe.");
  }
  for (const [sector, count] of Object.entries(sectorCounts)) {
    const share = count / total;
    if (share > maxShare) {
      throw new Error(
        `Sector concentration too high: ${sector} is ${(share * 100).toFixed(1)}% ` +
          `(${count}/${total}) of the universe, exceeding the ${(maxShare * 100).toFixed(0)}% ` +
          "ceiling. This is the signature of fund/ETF contamination — aborting."
      );
    }
  }
}

/**
 * Fail if fundamentals coverage drops below `minCoverage`. A flood of funds
 * (which have no fundamentals) drags this down well before it would otherwise
 * move, making it a sensitive contamination tripwire.
 */
export function assertFundamentalsCoverage(
  withFundamentals: number,
  total: number,
  minCoverage: number = MIN_FUNDAMENTALS_COVERAGE
): void {
  if (total <= 0) {
    throw new Error("Cannot check fundamentals coverage on an empty universe.");
  }
  const coverage = withFundamentals / total;
  if (coverage < minCoverage) {
    throw new Error(
      `Fundamentals coverage too low: ${withFundamentals}/${total} ` +
        `(${(coverage * 100).toFixed(1)}%) names have core fundamentals, below the ` +
        `${(minCoverage * 100).toFixed(0)}% floor. Likely fund/ETF contamination or a ` +
        "data-source outage — aborting."
    );
  }
}

/** Tally a universe's sector distribution. */
export function sectorCounts(
  universe: readonly { sector?: string }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { sector } of universe) {
    const key = sector || "Unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
