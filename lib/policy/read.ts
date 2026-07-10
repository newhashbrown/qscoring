import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  parsePolicyExposures,
  POLICY_PROMPT_VERSION,
  type PolicyExposures,
} from "./types";

// Read-only access to the latest policy-exposure classification per ticker
// (migrations/0011_policy_exposures.sql). All classification happens offline in
// the GitHub Actions batch job — this module only reads the stored row, so the
// company-page chips are a plain D1 read with no Anthropic/FMP call at request
// time. Outside a Worker (next dev, Node scripts) getCloudflareContext throws
// and this cleanly returns null, so callers degrade to "no data".

export type PolicyExposureRecord = {
  ticker: string;
  exposures: PolicyExposures;
  dataAsOf: string;
  model: string;
};

function getDb(): D1Database | null {
  try {
    return (getCloudflareContext()?.env as { DB?: D1Database } | undefined)?.DB ?? null;
  } catch {
    return null;
  }
}

/** Latest policy-exposure record for a ticker, or null when absent / off-Worker. */
export async function getPolicyExposures(ticker: string): Promise<PolicyExposureRecord | null> {
  const db = getDb();
  if (!db) return null;
  const cleaned = ticker.toUpperCase();
  try {
    const row = await db
      .prepare(
        `SELECT ticker, exposures_json, data_as_of, model
           FROM policy_exposures
          WHERE ticker = ?1 AND prompt_version = ?2
          LIMIT 1`
      )
      .bind(cleaned, POLICY_PROMPT_VERSION)
      .first<{ ticker: string; exposures_json: string; data_as_of: string; model: string }>();
    if (!row) return null;

    let exposures: PolicyExposures | null = null;
    try {
      exposures = parsePolicyExposures(JSON.parse(row.exposures_json));
    } catch {
      exposures = null;
    }
    // Stored blob no longer matches the schema (e.g. prompt-shape drift) — treat
    // as not-yet-available rather than surfacing a broken section.
    if (!exposures) return null;

    return { ticker: row.ticker, exposures, dataAsOf: row.data_as_of, model: row.model };
  } catch (err) {
    console.error(`policy_exposures read failed (${cleaned}):`, err);
    return null;
  }
}
