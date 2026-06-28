import { NextResponse } from "next/server";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";
import { getFactorExposures } from "@/lib/scoring/factor-exposures";

export const revalidate = 900;

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

// GET /api/factors/[ticker]
//
// Returns the ticker's latest Fama-French factor exposures from D1
// (migrations/0009_factor_exposures.sql). Read-only — no regression compute in
// the Worker. No-data (off-universe ticker, local dev without D1) returns
// { exposure: null } rather than an error so the UI can hide the section.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.FMP_IP_LIMITER, clientIp(req)))) return tooManyRequests();

  const { ticker } = await params;
  const cleaned = ticker.toUpperCase();
  if (!TICKER_RE.test(cleaned)) {
    return NextResponse.json({ error: "Invalid ticker", exposure: null }, { status: 400 });
  }

  try {
    const exposure = await getFactorExposures(cleaned);
    return NextResponse.json(
      { ticker: cleaned, exposure },
      { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=1800" } }
    );
  } catch (err) {
    console.error("[api/factors] error:", err);
    return NextResponse.json(
      { error: "Factor exposures temporarily unavailable.", exposure: null },
      { status: 502 }
    );
  }
}
