import { NextResponse } from "next/server";
import { scoreTicker } from "@/lib/scoring";

export const revalidate = 900;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const result = await scoreTicker(ticker);
    return NextResponse.json(result, {
      headers: {
        "cache-control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    let status = 500;
    if (/invalid ticker/i.test(message)) status = 400;
    else if (/data plan/i.test(message)) status = 402;
    else if (/not found|no profile/i.test(message)) status = 404;
    return NextResponse.json({ error: message }, { status });
  }
}
