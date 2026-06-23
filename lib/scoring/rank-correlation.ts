/**
 * Spearman rank-correlation primitive (mid-rank, tie-safe).
 *
 * This is the single source of truth for rank correlation across the codebase:
 * the live forward-return IC on /performance (lib/forward-returns.ts) and the
 * diagnostic weight-sensitivity research harness both import these functions so
 * their numbers are computed with identical math.
 *
 * Spearman is implemented as Pearson-on-ranks with average ranks for ties. We
 * deliberately do NOT use the 1 − 6Σd²/(n(n²−1)) shortcut, which is only valid
 * when there are no ties — composite scores are integers 0–100 over ~800 names,
 * so ties are pervasive and the shortcut would be wrong.
 */

/** Average ("mid") ranks, 1-based; tied values share the mean of their ranks. */
export function rank(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // average rank for ties (1-based)
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

/** Pearson correlation; NaN for empty input or zero variance in either series. */
export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return NaN;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return NaN;
  return cov / Math.sqrt(va * vb);
}

/**
 * Spearman rank correlation over the pairwise-finite subset of x and y.
 * Returns NaN when fewer than 2 usable pairs remain (caller decides how to
 * surface that — typically as "not enough data").
 */
export function spearman(
  x: Array<number | null>,
  y: Array<number | null>
): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const b = y[i];
    if (a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b)) {
      xs.push(a);
      ys.push(b);
    }
  }
  if (xs.length < 2) return NaN;
  return pearson(rank(xs), rank(ys));
}
