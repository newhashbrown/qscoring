import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@clerk/nextjs/server";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";
import { getUserTier, type Tier } from "@/lib/billing/tier";
import {
  parseNarrative,
  FREE_SECTIONS,
  NARRATIVE_SECTIONS,
  NARRATIVE_PROMPT_VERSION,
  type Narrative,
} from "@/lib/narratives/types";

// GET /api/narratives/:ticker
//
// Latest grounded narrative for the current prompt_version. Tier-gated:
// `financial_health` is free; every other section is returned ONLY to a paid
// user (getUserTier). Note the CACHE HEADER: `private, no-store`. The site's
// default `public, s-maxage` edge-caches by URL, which would serve the first
// (possibly free-tier) body to everyone and leak/deny paid content — so a
// per-user gated response must never be edge-cached.
//
// NOTE: tier gating is currently DORMANT — Clerk is not yet enabled in prod, so
// `auth()` yields no userId and everyone resolves to `free`. The gate is written
// correctly and activates automatically once Clerk is switched on.

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const PRIVATE = { "cache-control": "private, no-store" } as const;

async function currentTier(): Promise<Tier> {
  try {
    const { userId } = await auth();
    return userId ? await getUserTier(userId) : "free";
  } catch {
    return "free";
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.FMP_IP_LIMITER, clientIp(req)))) return tooManyRequests();

  const { ticker } = await params;
  const cleaned = ticker.toUpperCase();
  if (!TICKER_RE.test(cleaned)) {
    return NextResponse.json({ ticker: cleaned, status: "invalid" }, { status: 400, headers: PRIVATE });
  }

  let db: D1Database | undefined;
  try {
    db = (getCloudflareContext()?.env as { DB?: D1Database } | undefined)?.DB;
  } catch {
    db = undefined;
  }
  if (!db) {
    // No binding (local `next dev`) — empty, not an error, so the UI hides.
    return NextResponse.json({ ticker: cleaned, status: "empty" }, { headers: PRIVATE });
  }

  let row: { narrative_json: string; data_as_of: string; score_band: string; model: string } | null = null;
  try {
    row = await db
      .prepare(
        `SELECT narrative_json, data_as_of, score_band, model
           FROM ticker_narratives
          WHERE ticker = ?1 AND prompt_version = ?2
          ORDER BY data_as_of DESC LIMIT 1`
      )
      .bind(cleaned, NARRATIVE_PROMPT_VERSION)
      .first();
  } catch (err) {
    console.error("[api/narratives] error:", err);
    return NextResponse.json({ ticker: cleaned, status: "error" }, { status: 502, headers: PRIVATE });
  }

  if (!row) {
    return NextResponse.json({ ticker: cleaned, status: "empty" }, { headers: PRIVATE });
  }

  let parsed: Narrative | null = null;
  try {
    parsed = parseNarrative(JSON.parse(row.narrative_json));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    // Stored blob no longer matches the schema (e.g. prompt shape drift) — treat
    // as not-yet-available rather than surfacing a broken section.
    return NextResponse.json({ ticker: cleaned, status: "empty" }, { headers: PRIVATE });
  }

  const tier = await currentTier();
  const visible: Partial<Narrative> = {};
  const gatedSections: string[] = [];
  for (const key of NARRATIVE_SECTIONS) {
    if (tier === "pro" || FREE_SECTIONS.has(key)) {
      (visible as Record<string, unknown>)[key] = parsed[key];
    } else {
      gatedSections.push(key);
    }
  }

  return NextResponse.json(
    {
      ticker: cleaned,
      status: "ok",
      tier,
      promptVersion: NARRATIVE_PROMPT_VERSION,
      dataAsOf: row.data_as_of,
      scoreBand: row.score_band,
      model: row.model,
      narrative: visible,
      gated: gatedSections.length > 0,
      gatedSections,
    },
    { headers: PRIVATE }
  );
}
