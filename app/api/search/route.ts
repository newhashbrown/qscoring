import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/scoring/search";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";

export const revalidate = 3600;

export async function GET(req: Request) {
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.FMP_IP_LIMITER, clientIp(req)))) return tooManyRequests();

  const { searchParams } = new URL(req.url);
  // Cap query length before it reaches FMP — an unbounded string would be
  // marshaled into two upstream requests per call (audit M7). 50 chars covers
  // any real ticker/company query.
  const MAX_QUERY_LEN = 50;
  const query = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (!query) {
    return NextResponse.json({ matches: [] });
  }
  try {
    const matches = await searchSymbols(query, 8);
    return NextResponse.json(
      { matches },
      { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    // Log detail server-side; return a generic message (audit M3).
    console.error("[api/search] error:", err);
    return NextResponse.json(
      { matches: [], error: "Search temporarily unavailable." },
      { status: 502 }
    );
  }
}
