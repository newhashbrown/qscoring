import { NextResponse } from "next/server";
import { scoreTicker } from "@/lib/scoring";
import {
  MAX_PORTFOLIO_ENTRIES,
  analyzeBlend,
  normalizeWeights,
  type PortfolioRow,
} from "@/lib/portfolio";
import scoreboardData from "@/data/scoreboard.json";
import type { ScoreboardPick } from "@/data/categories";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const SCORING_CONCURRENCY = 4;

type Body = {
  entries?: Array<{ ticker?: string; rawWeight?: number }>;
};

function lookupInScoreboard(ticker: string): ScoreboardPick | null {
  return (
    (scoreboardData.picks as ScoreboardPick[]).find((p) => p.ticker === ticker) ?? null
  );
}

async function liveScore(ticker: string): Promise<ScoreboardPick | null> {
  try {
    const r = await scoreTicker(ticker);
    return {
      ticker: r.ticker,
      companyName: r.companyName,
      price: r.price,
      changePercent: r.changePercent,
      composite: Math.round(r.composite),
      signal: r.signal,
      confidence: r.confidence,
      longTermScore: Math.round(r.longTermScore),
      shortTermScore: Math.round(r.shortTermScore),
      categories: r.categories.map((c) => ({
        name: c.name,
        label: c.label,
        score: Math.round(c.score),
      })),
      // Tag the sector so the portfolio analyzer's sector-breakdown view
      // can group by it. ScoreboardPick doesn't normally carry sector;
      // we attach it here for portfolio-context use only.
      ...(r.sector ? { sector: r.sector } : {}),
    } as ScoreboardPick;
  } catch (err) {
    console.warn(`portfolio liveScore [${ticker}] failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  if (rawEntries.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No entries provided" },
      { status: 400 }
    );
  }
  if (rawEntries.length > MAX_PORTFOLIO_ENTRIES) {
    return NextResponse.json(
      { ok: false, error: `Too many entries — max ${MAX_PORTFOLIO_ENTRIES}` },
      { status: 400 }
    );
  }

  // Validate + dedupe + cap. Server-side guard so a malformed client can't
  // blow up the analyzer.
  const seen = new Set<string>();
  const cleaned: Array<{ ticker: string; rawWeight?: number }> = [];
  for (const e of rawEntries) {
    const ticker = String(e?.ticker ?? "").toUpperCase().trim();
    if (!TICKER_RE.test(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    const rawWeight =
      typeof e?.rawWeight === "number" && Number.isFinite(e.rawWeight) && e.rawWeight > 0
        ? e.rawWeight
        : undefined;
    cleaned.push({ ticker, rawWeight });
    if (cleaned.length >= MAX_PORTFOLIO_ENTRIES) break;
  }
  if (cleaned.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid tickers after parsing" },
      { status: 400 }
    );
  }

  const normalized = normalizeWeights(cleaned);

  // For each ticker: scoreboard hit → pick, else live scoreTicker.
  // Concurrency-bounded so a 30-name cold-cache call doesn't fire 180
  // FMP requests in parallel.
  const rows: PortfolioRow[] = await withConcurrency(
    normalized,
    SCORING_CONCURRENCY,
    async ({ ticker, weight }) => {
      const fromBoard = lookupInScoreboard(ticker);
      if (fromBoard) return { ticker, weight, pick: fromBoard };
      const live = await liveScore(ticker);
      if (live) return { ticker, weight, pick: live };
      return {
        ticker,
        weight,
        pick: null,
        error: "No score available — ticker may be outside our coverage universe.",
      };
    }
  );

  const analysis = analyzeBlend(rows);

  return NextResponse.json(
    { ok: true, analysis },
    {
      headers: {
        // Don't cache portfolio analyses — input is user-specific so
        // edge caching would leak holdings across users.
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    }
  );
}
