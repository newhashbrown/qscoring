import { NextResponse } from "next/server";
import { scoreTicker } from "@/lib/scoring";
import {
  MAX_PORTFOLIO_ENTRIES,
  analyzeBlend,
  deriveWeights,
  type PortfolioMode,
  type PortfolioRow,
} from "@/lib/portfolio";
import scoreboardData from "@/data/scoreboard.json";
import type { ScoreboardPick } from "@/data/categories";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const SCORING_CONCURRENCY = 4;
const VALID_MODES: readonly PortfolioMode[] = ["equal", "weights", "shares", "values"];

type Body = {
  mode?: string;
  entries?: Array<{ ticker?: string; rawNumber?: number }>;
};

// Index the scoreboard by ticker once at module load instead of scanning all
// ~800 picks per requested ticker. Turns the per-request lookup from
// O(entries × picks) into O(entries).
const scoreboardByTicker = new Map<string, ScoreboardPick>(
  (scoreboardData.picks as ScoreboardPick[]).map((p) => [p.ticker, p])
);

function lookupInScoreboard(ticker: string): ScoreboardPick | null {
  return scoreboardByTicker.get(ticker) ?? null;
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

  const mode: PortfolioMode = VALID_MODES.includes(body.mode as PortfolioMode)
    ? (body.mode as PortfolioMode)
    : "weights";

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

  const seen = new Set<string>();
  const cleaned: Array<{ ticker: string; rawNumber?: number }> = [];
  for (const e of rawEntries) {
    const ticker = String(e?.ticker ?? "").toUpperCase().trim();
    if (!TICKER_RE.test(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    const rawNumber =
      typeof e?.rawNumber === "number" && Number.isFinite(e.rawNumber) && e.rawNumber > 0
        ? e.rawNumber
        : undefined;
    cleaned.push({ ticker, rawNumber });
    if (cleaned.length >= MAX_PORTFOLIO_ENTRIES) break;
  }
  if (cleaned.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid tickers after parsing" },
      { status: 400 }
    );
  }

  // Score every ticker first — we need each ticker's price for "shares"
  // mode and the score data for the analysis itself. Concurrency-bounded
  // so a 30-name cold-cache call doesn't fire 180 FMP requests in parallel.
  type Scored = { ticker: string; rawNumber?: number; pick: ScoreboardPick | null };
  const scored: Scored[] = await withConcurrency(
    cleaned,
    SCORING_CONCURRENCY,
    async ({ ticker, rawNumber }) => {
      const fromBoard = lookupInScoreboard(ticker);
      if (fromBoard) return { ticker, rawNumber, pick: fromBoard };
      const live = await liveScore(ticker);
      return { ticker, rawNumber, pick: live };
    }
  );

  // Derive weights now that prices are known.
  const priceMap = new Map(
    scored.filter((s) => s.pick).map((s) => [s.ticker, s.pick!.price])
  );
  const weights = deriveWeights(
    scored.map((s) => ({ ticker: s.ticker, rawNumber: s.rawNumber })),
    mode,
    (t) => priceMap.get(t) ?? null
  );
  const weightByTicker = new Map(weights.map((w) => [w.ticker, w.weight]));

  const rows: PortfolioRow[] = scored.map((s) => ({
    ticker: s.ticker,
    weight: weightByTicker.get(s.ticker) ?? 0,
    pick: s.pick,
    error: s.pick ? undefined : "No score available — ticker may be outside our coverage universe.",
  }));

  const analysis = analyzeBlend(rows);

  return NextResponse.json(
    { ok: true, mode, analysis },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    }
  );
}
