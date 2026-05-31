/**
 * Weight-sensitivity / overfit probe for the QScore category weights.
 *
 * Reads an exported factor panel CSV (the wide one written by
 * scripts/research/export-factor-panel.ts — columns include
 * date,ticker,sector,value,growth,momentum,profitability,risk,composite,...),
 * recomputes the composite per row under the DEFAULT category weights, then
 * perturbs the 10 category weights (5 long-horizon + 5 short-horizon) across a
 * grid of multiplicative deltas, renormalizes each horizon's weights to sum to
 * 1, and recomputes the composite for every perturbed weight vector.
 *
 * For each perturbed weight vector it records:
 *   - the perturbation delta applied,
 *   - the Spearman rank-correlation of the perturbed composite vs the DEFAULT
 *     composite (the stability statistic),
 *   - the mean perturbed composite.
 *
 * Output: research/data/weight_sensitivity.csv (gitignored).
 *
 * Overfit interpretation: a robust model has a broad, smooth plateau — the
 * rank-correlation vs default stays high across weight perturbations. A sharp
 * collapse under small perturbations means the chosen weights sit on a fragile
 * peak (over-tuned). research/weight_surface.py plots this surface.
 *
 * NOTE: this contains NO forward returns, so it can only measure STABILITY of
 * the ranking against the default weights — not a true forward-return IC.
 *
 * Dependency-free (manual CSV parse), mirrors export-factor-panel.ts style.
 * Reads a local CSV only — no FMP / network. Run via tsx:
 *   npx tsx scripts/research/weight-sensitivity.ts --panel research/data/factor_panel_snapshots.csv
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ── Default category weights — MUST mirror lib/scoring/score.ts (W_LONG / W_SHORT).
// Duplicated (not imported) to keep this script dependency-free and runnable
// against a CSV without pulling the scorer. Keep in sync with score.ts.
const W_LONG: Record<Category, number> = {
  value: 0.3,
  growth: 0.2,
  profitability: 0.25,
  momentum: 0.05,
  risk: 0.2,
};
const W_SHORT: Record<Category, number> = {
  value: 0.1,
  growth: 0.15,
  profitability: 0.1,
  momentum: 0.4,
  risk: 0.25,
};

type Category = "value" | "growth" | "momentum" | "profitability" | "risk";
const CATEGORIES: Category[] = ["value", "growth", "momentum", "profitability", "risk"];

// Perturbation grid: multiplicative deltas applied to every category weight in
// turn, across both horizons. Keep small so we probe the local neighborhood of
// the chosen weights (where overfit fragility would show up first).
const DELTAS = [-0.5, -0.3, -0.15, 0, 0.15, 0.3, 0.5];

// ── args ────────────────────────────────────────────────────────────────────
function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PANEL = arg("panel", path.join("research", "data", "factor_panel_snapshots.csv"));
const OUT_DIR = path.resolve(process.cwd(), "research", "data");
const OUT_FILE = "weight_sensitivity.csv";

// ── CSV parse (manual, mirrors the other scripts) ─────────────────────────────
type PanelRow = Record<Category, number | null>;

function parsePanel(file: string): PanelRow[] {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    throw new Error(`Panel CSV not found: ${abs}. Export one with npm run research:export.`);
  }
  const text = fs.readFileSync(abs, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error(`Panel CSV ${abs} has no data rows.`);

  const headers = lines[0].split(",").map((h) => h.trim());
  const colIdx: Record<string, number> = {};
  headers.forEach((h, i) => (colIdx[h] = i));
  for (const c of CATEGORIES) {
    if (!(c in colIdx)) throw new Error(`Panel CSV missing required category column "${c}".`);
  }

  const rows: PanelRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const row = {} as PanelRow;
    for (const c of CATEGORIES) {
      const v = cells[colIdx[c]];
      const n = v === undefined || v.trim() === "" ? NaN : Number(v);
      row[c] = Number.isFinite(n) ? n : null;
    }
    rows.push(row);
  }
  return rows;
}

function loadMeta(panelFile: string): { provenance: string; bias: string[] } {
  // Sidecar is <panel>.meta.json (matches export-factor-panel.ts naming).
  const abs = path.resolve(process.cwd(), panelFile);
  const guesses = [
    abs.replace(/\.csv$/, ".meta.json"),
    path.join(path.dirname(abs), path.basename(abs, ".csv") + ".meta.json"),
  ];
  for (const g of guesses) {
    if (fs.existsSync(g)) {
      try {
        const m = JSON.parse(fs.readFileSync(g, "utf-8"));
        return { provenance: String(m.provenance ?? "unknown"), bias: Array.isArray(m.bias) ? m.bias : [] };
      } catch {
        /* fall through */
      }
    }
  }
  return { provenance: "unknown", bias: [] };
}

// ── composite recomputation ───────────────────────────────────────────────────
function normalize(weights: Record<Category, number>): Record<Category, number> {
  const sum = CATEGORIES.reduce((s, c) => s + weights[c], 0);
  if (sum <= 0) return { ...weights };
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) out[c] = weights[c] / sum;
  return out;
}

/**
 * Composite for one row = (longTerm + shortTerm) / 2, where each horizon is the
 * weighted average of available category scores (missing categories dropped and
 * the remaining weights effectively renormalized — mirrors score.ts aggregate).
 * Recomputed from the category-score columns rather than the panel's rounded
 * `composite` column so the default baseline isn't polluted by rounding.
 */
function rowComposite(
  row: PanelRow,
  wLong: Record<Category, number>,
  wShort: Record<Category, number>
): number | null {
  const horizon = (w: Record<Category, number>): number | null => {
    let ws = 0;
    let ss = 0;
    for (const c of CATEGORIES) {
      const s = row[c];
      if (s === null) continue;
      ws += w[c];
      ss += w[c] * s;
    }
    return ws > 0 ? ss / ws : null;
  };
  const lt = horizon(wLong);
  const st = horizon(wShort);
  if (lt === null || st === null) return null;
  return (lt + st) / 2;
}

// ── Spearman rank correlation (manual; pairwise over finite values) ───────────
function rank(values: number[]): number[] {
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

function pearson(a: number[], b: number[]): number {
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

function spearman(x: Array<number | null>, y: Array<number | null>): number {
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

function mean(vals: Array<number | null>): number {
  const f = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  if (f.length === 0) return NaN;
  return f.reduce((s, v) => s + v, 0) / f.length;
}

// ── main ──────────────────────────────────────────────────────────────────────
function main() {
  const rows = parsePanel(PANEL);
  const meta = loadMeta(PANEL);

  // Default composite per row (the stability baseline).
  const defaultComposite = rows.map((r) => rowComposite(r, normalize(W_LONG), normalize(W_SHORT)));

  type OutRow = {
    horizon: "long" | "short";
    category: Category;
    delta: number;
    w_value: number;
    w_growth: number;
    w_momentum: number;
    w_profitability: number;
    w_risk: number;
    rank_corr_vs_default: number;
    mean_composite: number;
    n_rows: number;
  };
  const out: OutRow[] = [];

  // Perturb one (horizon, category) weight at a time across the delta grid.
  for (const horizon of ["long", "short"] as const) {
    const base = horizon === "long" ? W_LONG : W_SHORT;
    for (const category of CATEGORIES) {
      for (const delta of DELTAS) {
        const perturbed: Record<Category, number> = { ...base };
        perturbed[category] = base[category] * (1 + delta);
        const wLong = horizon === "long" ? normalize(perturbed) : normalize(W_LONG);
        const wShort = horizon === "short" ? normalize(perturbed) : normalize(W_SHORT);

        const composite = rows.map((r) => rowComposite(r, wLong, wShort));
        const rho = spearman(composite, defaultComposite);
        const wUsed = horizon === "long" ? wLong : wShort;
        const finiteN = composite.filter((c) => c !== null && Number.isFinite(c)).length;

        out.push({
          horizon,
          category,
          delta,
          w_value: round4(wUsed.value),
          w_growth: round4(wUsed.growth),
          w_momentum: round4(wUsed.momentum),
          w_profitability: round4(wUsed.profitability),
          w_risk: round4(wUsed.risk),
          rank_corr_vs_default: round4(rho),
          mean_composite: round4(mean(composite)),
          n_rows: finiteN,
        });
      }
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const headers = [
    "horizon", "category", "delta",
    "w_value", "w_growth", "w_momentum", "w_profitability", "w_risk",
    "rank_corr_vs_default", "mean_composite", "n_rows",
  ];
  const lines = [
    `# provenance=${meta.provenance} bias=${meta.bias.join("|") || "none"} panel=${path.basename(PANEL)}`,
    headers.join(","),
  ];
  for (const r of out) {
    lines.push([
      r.horizon, r.category, r.delta,
      r.w_value, r.w_growth, r.w_momentum, r.w_profitability, r.w_risk,
      r.rank_corr_vs_default, r.mean_composite, r.n_rows,
    ].join(","));
  }
  const outPath = path.join(OUT_DIR, OUT_FILE);
  fs.writeFileSync(outPath, lines.join("\n") + "\n");

  console.log(
    `weight-sensitivity: ${rows.length} panel rows, ${out.length} perturbed weight vectors → ${outPath}`
  );
  console.log(`  panel provenance=${meta.provenance}${meta.bias.length ? ` (bias: ${meta.bias.join(", ")})` : ""}`);
}

function round4(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : NaN;
}

main();
