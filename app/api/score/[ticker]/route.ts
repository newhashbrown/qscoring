import { NextResponse } from "next/server";
import { scoreTicker } from "@/lib/scoring";
import { FmpUnavailableError } from "@/lib/scoring/fmp";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";

export const revalidate = 900;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.FMP_IP_LIMITER, clientIp(req)))) return tooManyRequests();

  const { ticker } = await params;
  try {
    const result = await scoreTicker(ticker);
    return NextResponse.json(result, {
      headers: {
        "cache-control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (err) {
    // Always log full detail server-side for debugging (audit M3).
    console.error("[api/score] error:", err);
    // FmpUnavailableError carries a curated, user-safe message ("Ticker not
    // found", "not in the current data plan"); surface it.
    if (err instanceof FmpUnavailableError) {
      const status = /data plan/i.test(err.message) ? 402 : 404;
      return NextResponse.json({ error: err.message }, { status });
    }
    // Invalid ticker: return a fixed string, never echo the raw input.
    const message = err instanceof Error ? err.message : "";
    if (/invalid ticker/i.test(message)) {
      return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 });
    }
    // Everything else (raw FMP bodies, network, D1) → generic, no internals.
    return NextResponse.json(
      { error: "Score temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
