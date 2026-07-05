import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FactorExposure, FactorExposureFlag, FactorKey } from "./types";

// Read-only access to the latest Fama-French factor exposures per ticker
// (migrations/0009_factor_exposures.sql). All regression compute happens in the
// monthly GitHub Actions job — this module only reads the precomputed row.
//
// Outside a Worker (next dev, Node scripts) getCloudflareContext throws and
// getFactorExposures cleanly returns null, so callers degrade to "no data".

type RawRow = {
  ticker: string;
  snapshot_date: string;
  model_version: string | null;
  beta_mkt_rf: number | null;
  beta_smb: number | null;
  beta_hml: number | null;
  beta_rmw: number | null;
  beta_cma: number | null;
  beta_mom: number | null;
  tstat_mkt_rf: number | null;
  tstat_smb: number | null;
  tstat_hml: number | null;
  tstat_rmw: number | null;
  tstat_cma: number | null;
  tstat_mom: number | null;
  alpha_annualized: number | null;
  alpha_tstat: number | null;
  r2: number | null;
  adj_r2: number | null;
  n_obs: number;
  window_start: string | null;
  window_end: string | null;
  style_label: string | null;
  flags: string | null;
};

const KNOWN_FLAGS: readonly FactorExposureFlag[] = [
  "insufficient_history",
  "low_explanatory_power",
];

function getDb(): D1Database | null {
  try {
    return (getCloudflareContext()?.env as { DB?: D1Database } | undefined)?.DB ?? null;
  } catch {
    return null;
  }
}

/**
 * Maximum age of the newest factor month before the profile fails closed.
 *
 * The regression window ends at the last complete month Ken French has
 * published (~monthly cadence with lag), refreshed by the monthly Actions
 * job. 75 days ≈ two missed publications: one missed refresh still renders
 * (the data is merely one month behind, normal for FF lag), a second means
 * the pipeline is broken and the profile must show its existing no-data
 * state rather than silently aging — the same fail-closed philosophy as the
 * snapshot ledger.
 */
export const FACTOR_STALENESS_MAX_DAYS = 75;

const MS_PER_DAY = 86_400_000;

/**
 * True when the exposure row's data recency (window_end, falling back to
 * snapshot_date) is more than FACTOR_STALENESS_MAX_DAYS before `now` — or
 * cannot be determined at all (fail closed, never fail open).
 */
export function isFactorDataStale(
  windowEnd: string | null,
  snapshotDate: string | null,
  now: Date
): boolean {
  const recency = windowEnd ?? snapshotDate;
  if (!recency) return true;
  const t = Date.parse(`${recency}T00:00:00Z`);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > FACTOR_STALENESS_MAX_DAYS * MS_PER_DAY;
}

function parseFlags(raw: string | null): FactorExposureFlag[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is FactorExposureFlag =>
      (KNOWN_FLAGS as readonly string[]).includes(f)
    );
  } catch {
    return [];
  }
}

function mapRow(row: RawRow): FactorExposure {
  const betas: Record<FactorKey, number | null> = {
    mktRf: row.beta_mkt_rf,
    smb: row.beta_smb,
    hml: row.beta_hml,
    rmw: row.beta_rmw,
    cma: row.beta_cma,
    mom: row.beta_mom,
  };
  const tstats: Record<FactorKey, number | null> = {
    mktRf: row.tstat_mkt_rf,
    smb: row.tstat_smb,
    hml: row.tstat_hml,
    rmw: row.tstat_rmw,
    cma: row.tstat_cma,
    mom: row.tstat_mom,
  };
  return {
    ticker: row.ticker,
    snapshotDate: row.snapshot_date,
    modelVersion: row.model_version,
    betas,
    tstats,
    alphaAnnualized: row.alpha_annualized,
    alphaTstat: row.alpha_tstat,
    r2: row.r2,
    adjR2: row.adj_r2,
    nObs: row.n_obs,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    styleLabel: row.style_label,
    flags: parseFlags(row.flags),
  };
}

/** Latest factor-exposure row for a ticker, or null when absent / off-Worker. */
export async function getFactorExposures(ticker: string): Promise<FactorExposure | null> {
  const db = getDb();
  if (!db) return null;
  const cleaned = ticker.toUpperCase();
  try {
    const row = await db
      .prepare(
        `SELECT ticker, snapshot_date, model_version,
                beta_mkt_rf, beta_smb, beta_hml, beta_rmw, beta_cma, beta_mom,
                tstat_mkt_rf, tstat_smb, tstat_hml, tstat_rmw, tstat_cma, tstat_mom,
                alpha_annualized, alpha_tstat, r2, adj_r2, n_obs,
                window_start, window_end, style_label, flags
           FROM factor_exposures
          WHERE ticker = ?1
          ORDER BY snapshot_date DESC
          LIMIT 1`
      )
      .bind(cleaned)
      .first<RawRow>();
    if (!row) return null;
    // Staleness guard: a factor profile whose newest month is > 75 days old
    // means the monthly refresh job has missed ~two publications — show the
    // existing fail-closed no-data state instead of silently aging betas.
    if (isFactorDataStale(row.window_end, row.snapshot_date, new Date())) {
      console.warn(
        `factor_exposures for ${cleaned} are stale (window_end=${row.window_end}, ` +
          `snapshot_date=${row.snapshot_date}) — failing closed to the no-data state.`
      );
      return null;
    }
    return mapRow(row);
  } catch (err) {
    console.error(`factor_exposures read failed (${cleaned}):`, err);
    return null;
  }
}
