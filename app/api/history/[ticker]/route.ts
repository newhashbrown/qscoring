import { NextResponse } from "next/server";
import { fmp } from "@/lib/scoring/fmp";
import { getRateLimitEnv, allow, tooManyRequests, clientIp } from "@/lib/ratelimit";

export const revalidate = 900;

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const rl = getRateLimitEnv();
  if (!(await allow(rl?.FMP_IP_LIMITER, clientIp(req)))) return tooManyRequests();

  const { ticker } = await params;
  const cleaned = ticker.toUpperCase();
  if (!TICKER_RE.test(cleaned)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  try {
    const history = await fmp.historical(cleaned);
    // Return only the fields the chart needs and cap at 5 years (~1300 records)
    // to keep the response small.
    const trimmed = history.slice(0, 1300).map((p) => ({ date: p.date, price: p.price }));
    return NextResponse.json(
      { ticker: cleaned, history: trimmed },
      { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=1800" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, history: [] }, { status: 500 });
  }
}
