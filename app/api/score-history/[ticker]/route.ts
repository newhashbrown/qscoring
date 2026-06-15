import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";
import { buildScoreHistory, type RawSnapshotRow } from "@/lib/score-history";

export const revalidate = 900;

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

// GET /api/score-history/[ticker]
//
// Returns the ticker's composite + five-factor QScore series reconstructed
// from the append-only score_snapshots ledger (D1), plus the most recent
// signal-change date. Empty history (off-universe ticker, or fewer than a
// day captured) returns { points: [] } so the chart can hide itself.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.FMP_IP_LIMITER, clientIp(req)))) return tooManyRequests();

  const { ticker } = await params;
  const cleaned = ticker.toUpperCase();
  if (!TICKER_RE.test(cleaned)) {
    return NextResponse.json({ error: "Invalid ticker", points: [] }, { status: 400 });
  }

  let db: D1Database | undefined;
  try {
    db = (getCloudflareContext()?.env as { DB?: D1Database } | undefined)?.DB;
  } catch {
    db = undefined;
  }
  if (!db) {
    // No D1 binding (e.g. local `next dev`) — empty history, not an error.
    return NextResponse.json({ ticker: cleaned, points: [], lastSignalChange: null });
  }

  try {
    const { results } = await db
      .prepare(
        `SELECT snapshot_date, composite, signal, categories_json
           FROM score_snapshots
          WHERE ticker = ?1
          ORDER BY snapshot_date ASC`
      )
      .bind(cleaned)
      .all<RawSnapshotRow>();

    const history = buildScoreHistory(results ?? []);
    return NextResponse.json(
      { ticker: cleaned, points: history.points, lastSignalChange: history.lastSignalChange },
      { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=1800" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, points: [] }, { status: 500 });
  }
}
