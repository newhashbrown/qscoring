/**
 * Grounding payload builder (AI-analysis roadmap, Phase 1).
 *
 * PURE: takes already-fetched D1 rows and returns the exact JSON the model is
 * grounded on, plus an `input_hash` used to skip unchanged tickers. No I/O here,
 * so it is unit-testable with fixture rows (see grounding.test.ts). The route
 * (app/api/cron/narrative-grounding) does the D1 reads and calls this.
 *
 * Grounding sources (all D1-derived):
 *   - score_snapshots  → QScore, signal, factor category scores, latest price
 *   - fundamentals_facts (FY rows) → 5y revenue/EPS/FCF/margins, debt, cash
 *   - factor_exposures → Fama-French betas (optional)
 *   - universe_percentile → rank of the composite within the snapshot date,
 *     computed by the caller (score_snapshots has no sector column, so a
 *     sector-relative percentile is deferred to a later phase).
 * Valuation multiples are NOT stored anywhere; they are COMPUTED here from the
 * snapshot price × the latest FY fundamentals.
 *
 * input_hash design (the churn guard): the hash is taken over a deliberately
 * COARSE projection — score band (not the raw composite), integer percentile,
 * quarterly fundamentals, and HARD-rounded multiples (P/E to the nearest whole
 * number; P/S, P/B, EV/EBITDA to the nearest 0.5). Market cap and the raw price
 * are excluded from the hash entirely. A typical ≤1% daily price move cannot
 * cross a rounding boundary, so the hash holds steady day-to-day and the
 * generator skips the ticker; a large move (or a new filing / band change) flips
 * a bucket and triggers a genuine regeneration.
 */

export type NarrativeSnapshotRow = {
  ticker: string;
  snapshot_date: string;
  company_name: string | null;
  composite: number;
  long_term: number | null;
  short_term: number | null;
  signal: string;
  confidence: string | null;
  price: number | null;
  categories_json: string | null;
};

export type NarrativeFundamentalRow = {
  fiscal_year: string;
  fiscal_period_end: string;
  period: string;
  reported_currency: string | null;
  revenue: number | null;
  eps_diluted: number | null;
  free_cash_flow: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  total_equity: number | null;
  total_debt: number | null;
  cash_and_equivalents: number | null;
  ebitda: number | null;
  net_income: number | null;
  shares_diluted: number | null;
};

export type NarrativeFactorRow = {
  beta_mkt_rf: number | null;
  beta_smb?: number | null;
  beta_hml?: number | null;
  beta_mom?: number | null;
} | null;

/** A prior daily snapshot, for the QScore trend summary. */
export type NarrativeHistoryRow = {
  snapshot_date: string;
  composite: number;
  signal: string;
};

export type GroundingInputs = {
  snapshot: NarrativeSnapshotRow;
  /** FY fundamentals rows (any order); Q rows should be filtered out by caller. */
  fundamentals: NarrativeFundamentalRow[];
  factor: NarrativeFactorRow;
  /** 0–100 integer rank of the composite within the snapshot date, or null. */
  universePercentile: number | null;
  /** Recent daily snapshots (any order) for the QScore history summary. */
  history?: NarrativeHistoryRow[];
};

export type QScoreHistory = {
  window_snapshots: number;
  composite_start: number;
  composite_change: number;
  composite_min: number;
  composite_max: number;
  last_signal_change: { date: string; from: string; to: string } | null;
};

export type FactorScore = { name: string; label: string; score: number };

export type GroundingPayload = {
  ticker: string;
  company_name: string | null;
  data_as_of: string;
  units: { money: "USD millions"; margins: "percent" };
  qscore: {
    composite: number;
    band: string;
    signal: string;
    confidence: string | null;
    long_term: number | null;
    short_term: number | null;
    universe_percentile: number | null;
    factor_scores: FactorScore[];
    history: QScoreHistory | null;
  };
  fundamentals: {
    currency: string | null;
    fiscal_years: string[];
    latest_fiscal_year: string | null;
    revenue_usd_m: Array<number | null>;
    revenue_cagr_pct: number | null;
    eps_diluted: Array<number | null>;
    free_cash_flow_usd_m: Array<number | null>;
    gross_margin_pct: number | null;
    operating_margin_pct: number | null;
    net_margin_pct: number | null;
    total_debt_usd_m: number | null;
    cash_usd_m: number | null;
    net_debt_usd_m: number | null;
  };
  valuation: {
    market_cap_usd_m: number | null;
    pe_ratio: number | null;
    ps_ratio: number | null;
    pb_ratio: number | null;
    ev_to_ebitda: number | null;
  };
  factor_profile: {
    market_beta: number | null;
    size_beta: number | null;
    value_beta: number | null;
    momentum_beta: number | null;
  } | null;
};

export type GroundingResult = {
  payload: GroundingPayload;
  inputHash: string;
  dataAsOf: string;
  scoreBand: string;
};

// ── numeric helpers ────────────────────────────────────────────────────────
const finite = (v: number | null | undefined): number | null =>
  v !== null && v !== undefined && Number.isFinite(v) ? v : null;

const roundTo = (x: number, step: number): number =>
  Math.round(x / step) * step;

/** Round to `digits` significant figures (keeps magnitude, tames price noise). */
function sig(x: number, digits = 3): number {
  if (x === 0) return 0;
  const mag = Math.ceil(Math.log10(Math.abs(x)));
  const factor = Math.pow(10, digits - mag);
  return Math.round(x * factor) / factor;
}

/** USD → USD millions, 3 significant figures. */
function toMillions(usd: number | null): number | null {
  const v = finite(usd);
  return v === null ? null : sig(v / 1e6, 3);
}

/** fraction → percent, one decimal. */
function toPct(frac: number | null): number | null {
  const v = finite(frac);
  return v === null ? null : Number((v * 100).toFixed(1));
}

/** composite 0–100 → decade band label, e.g. 73 → "70-79", 100 → "90-100". */
export function scoreBandOf(composite: number): string {
  const c = Math.max(0, Math.min(100, Math.round(composite)));
  const lo = Math.min(90, Math.floor(c / 10) * 10);
  const hi = lo === 90 ? 100 : lo + 9;
  return `${lo}-${hi}`;
}

function parseFactorScores(json: string | null): FactorScore[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: FactorScore[] = [];
    for (const item of raw) {
      const r = item as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name : null;
      const score = typeof r.score === "number" && Number.isFinite(r.score) ? r.score : null;
      if (name && score !== null) {
        out.push({
          name,
          label: typeof r.label === "string" ? r.label : name,
          score: Math.round(score),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Summarize recent snapshots into a compact QScore trend (needs ≥2 points). */
function summarizeHistory(rows: NarrativeHistoryRow[] | undefined): QScoreHistory | null {
  if (!rows || rows.length < 2) return null;
  const ordered = [...rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const composites = ordered.map((r) => Math.round(r.composite));
  const start = composites[0];
  const end = composites[composites.length - 1];

  let lastSignalChange: QScoreHistory["last_signal_change"] = null;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].signal !== ordered[i - 1].signal) {
      lastSignalChange = {
        date: ordered[i].snapshot_date,
        from: ordered[i - 1].signal,
        to: ordered[i].signal,
      };
    }
  }

  return {
    window_snapshots: ordered.length,
    composite_start: start,
    composite_change: end - start,
    composite_min: Math.min(...composites),
    composite_max: Math.max(...composites),
    last_signal_change: lastSignalChange,
  };
}

/** FMP statements are newest-first; sort FY rows oldest→newest by period end. */
function orderedFY(rows: NarrativeFundamentalRow[]): NarrativeFundamentalRow[] {
  return [...rows]
    .filter((r) => r.period === "FY")
    .sort((a, b) => a.fiscal_period_end.localeCompare(b.fiscal_period_end));
}

// ── stable, non-crypto fingerprint (cyrb53) ────────────────────────────────
// A change-detection fingerprint, not a security hash: fast, sync, dependency-
// free, and identical in the Worker, the script, and unit tests. Computed over a
// canonicalized (sorted-key) JSON string so key order never affects the digest.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) sorted[key] = canonicalize(obj[key]);
    return sorted;
  }
  return value;
}

export function stableHash(value: unknown): string {
  const str = JSON.stringify(canonicalize(value));
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const digest = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return digest.toString(16).padStart(14, "0");
}

/** Build the grounding payload + change-detection hash from D1 rows. */
export function buildGroundingPayload(inputs: GroundingInputs): GroundingResult {
  const { snapshot: s, factor, universePercentile } = inputs;
  const fy = orderedFY(inputs.fundamentals);
  const latest = fy.length ? fy[fy.length - 1] : null;
  const price = finite(s.price);

  // 5-year series (aligned to fiscal_years), in USD millions.
  const fiscalYears = fy.map((r) => r.fiscal_year);
  const revenueM = fy.map((r) => toMillions(r.revenue));
  const epsSeries = fy.map((r) => {
    const v = finite(r.eps_diluted);
    return v === null ? null : Number(v.toFixed(2));
  });
  const fcfM = fy.map((r) => toMillions(r.free_cash_flow));

  // Revenue CAGR over the window (needs a positive first year).
  let revenueCagr: number | null = null;
  const firstRev = finite(fy[0]?.revenue);
  const lastRev = finite(latest?.revenue ?? null);
  if (firstRev !== null && lastRev !== null && firstRev > 0 && fy.length >= 2) {
    revenueCagr = Number(((Math.pow(lastRev / firstRev, 1 / (fy.length - 1)) - 1) * 100).toFixed(1));
  }

  const debtM = toMillions(latest?.total_debt ?? null);
  const cashM = toMillions(latest?.cash_and_equivalents ?? null);
  const netDebtM = debtM !== null && cashM !== null ? Number((debtM - cashM).toFixed(1)) : null;

  // Valuation — computed from price × latest FY fundamentals.
  const shares = finite(latest?.shares_diluted ?? null);
  const eps = finite(latest?.eps_diluted ?? null);
  const revenue = finite(latest?.revenue ?? null);
  const equity = finite(latest?.total_equity ?? null);
  const ebitda = finite(latest?.ebitda ?? null);
  const totalDebt = finite(latest?.total_debt ?? null);
  const cash = finite(latest?.cash_and_equivalents ?? null);

  const marketCap = price !== null && shares !== null ? price * shares : null;
  const marketCapM = toMillions(marketCap);
  const peRatio = price !== null && eps !== null && eps > 0 ? Math.round(price / eps) : null;
  const psRatio =
    marketCap !== null && revenue !== null && revenue > 0
      ? roundTo(marketCap / revenue, 0.5)
      : null;
  const pbRatio =
    marketCap !== null && equity !== null && equity > 0
      ? roundTo(marketCap / equity, 0.5)
      : null;
  const ev =
    marketCap !== null && totalDebt !== null && cash !== null
      ? marketCap + totalDebt - cash
      : null;
  const evToEbitda =
    ev !== null && ebitda !== null && ebitda > 0 ? roundTo(ev / ebitda, 0.5) : null;

  const factorProfile = factor
    ? {
        market_beta: finite(factor.beta_mkt_rf) === null ? null : Number(factor.beta_mkt_rf!.toFixed(2)),
        size_beta: finite(factor.beta_smb ?? null) === null ? null : Number(factor.beta_smb!.toFixed(2)),
        value_beta: finite(factor.beta_hml ?? null) === null ? null : Number(factor.beta_hml!.toFixed(2)),
        momentum_beta: finite(factor.beta_mom ?? null) === null ? null : Number(factor.beta_mom!.toFixed(2)),
      }
    : null;

  const band = scoreBandOf(s.composite);

  const payload: GroundingPayload = {
    ticker: s.ticker,
    company_name: s.company_name,
    data_as_of: s.snapshot_date,
    units: { money: "USD millions", margins: "percent" },
    qscore: {
      composite: Math.round(s.composite),
      band,
      signal: s.signal,
      confidence: s.confidence,
      long_term: finite(s.long_term) === null ? null : Math.round(s.long_term!),
      short_term: finite(s.short_term) === null ? null : Math.round(s.short_term!),
      universe_percentile: universePercentile === null ? null : Math.round(universePercentile),
      factor_scores: parseFactorScores(s.categories_json),
      // Daily-moving trend summary — shown to the model but, like the valuation
      // multiples, DELIBERATELY excluded from input_hash so it can't churn regen.
      history: summarizeHistory(inputs.history),
    },
    fundamentals: {
      currency: latest?.reported_currency ?? fy[0]?.reported_currency ?? null,
      fiscal_years: fiscalYears,
      latest_fiscal_year: latest?.fiscal_year ?? null,
      revenue_usd_m: revenueM,
      revenue_cagr_pct: revenueCagr,
      eps_diluted: epsSeries,
      free_cash_flow_usd_m: fcfM,
      gross_margin_pct: toPct(latest?.gross_margin ?? null),
      operating_margin_pct: toPct(latest?.operating_margin ?? null),
      net_margin_pct: toPct(latest?.net_margin ?? null),
      total_debt_usd_m: debtM,
      cash_usd_m: cashM,
      net_debt_usd_m: netDebtM,
    },
    valuation: {
      market_cap_usd_m: marketCapM,
      pe_ratio: peRatio,
      ps_ratio: psRatio,
      pb_ratio: pbRatio,
      ev_to_ebitda: evToEbitda,
    },
    factor_profile: factorProfile,
  };

  // Hash projection = the spec's regeneration triggers ONLY: score band + the
  // quarterly fundamentals. Price-derived fields (market cap, all valuation
  // multiples) and the daily-moving universe percentile are DELIBERATELY excluded
  // — they are shown to the model but must not drive regeneration, or the hash
  // would churn on every price tick and defeat the cost cap. (prompt_version, the
  // third trigger, is handled by the skip check in the generator, not the hash.)
  const hashInput = {
    band,
    fundamentals: {
      years: fiscalYears,
      revenue: revenueM,
      eps: epsSeries,
      fcf: fcfM,
      gross: payload.fundamentals.gross_margin_pct,
      operating: payload.fundamentals.operating_margin_pct,
      net: payload.fundamentals.net_margin_pct,
      debt: debtM,
      cash: cashM,
    },
  };

  return {
    payload,
    inputHash: stableHash(hashInput),
    dataAsOf: s.snapshot_date,
    scoreBand: band,
  };
}
