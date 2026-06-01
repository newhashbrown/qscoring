import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/scoring/search";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";

export const revalidate = 3600;

export async function GET(req: Request) {
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.FMP_IP_LIMITER, clientIp(req)))) return tooManyRequests();

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ matches: [], error: message }, { status: 500 });
  }
}
