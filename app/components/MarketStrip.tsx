import { fmp, type Quote } from "@/lib/scoring/fmp";
import { MARKET_STRIP_ENABLED } from "@/lib/feature-flags";
import scoreboardData from "@/data/scoreboard.json";
import type { ScoreboardPick } from "@/data/categories";

// Market context strip below the nav. Renders four US equity index
// quotes (S&P 500, Nasdaq Composite, Russell 2000, VIX) plus the QScore
// Universe Average composite — that last one is a number only QScoring
// can produce, so it doubles as a subtle moat signal.
//
// Server component; data is fetched per render via the existing fmp
// wrapper which uses Next's data cache (15-minute TTL on quote calls).
// Four indices × 1 call each × 4-per-15-min cap = ~16 FMP calls/hour
// across all visitors site-wide. Trivial vs the existing scoring load.
//
// Toggled site-wide via MARKET_STRIP_ENABLED in lib/feature-flags.ts.

const INDICES: Array<{ symbol: string; label: string }> = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^RUT", label: "Russell 2000" },
  { symbol: "^VIX", label: "VIX" },
];

function formatLevel(value: number): string {
  if (value >= 10000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return value.toFixed(2);
}

function formatChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

async function fetchIndexQuote(symbol: string): Promise<Quote | null> {
  try {
    const result = await fmp.quote(symbol);
    return result?.[0] ?? null;
  } catch {
    return null;
  }
}

function universeAverage(): number | null {
  const picks = scoreboardData.picks as ScoreboardPick[];
  if (picks.length === 0) return null;
  const sum = picks.reduce((s, p) => s + p.composite, 0);
  return sum / picks.length;
}

export default async function MarketStrip() {
  if (!MARKET_STRIP_ENABLED) return null;

  const quotes = await Promise.all(INDICES.map((i) => fetchIndexQuote(i.symbol)));
  const avg = universeAverage();

  // If every quote failed (FMP outage or rate-limit) and we have no
  // universe average either, render nothing — better than a strip of
  // dashes. The page below renders normally without us.
  const hasAnyData = quotes.some((q) => q !== null) || avg !== null;
  if (!hasAnyData) return null;

  return (
    <aside className="market-strip" aria-label="Market context">
      <ul className="market-strip-row">
        {INDICES.map((idx, i) => {
          const q = quotes[i];
          if (!q) return null;
          const tone = q.changePercentage >= 0 ? "up" : "down";
          return (
            <li key={idx.symbol} className="market-strip-item">
              <span className="market-strip-label">{idx.label}</span>
              <span className="market-strip-level">{formatLevel(q.price)}</span>
              <span className={`market-strip-change ${tone}`}>
                {q.changePercentage >= 0 ? "▲" : "▼"} {formatChange(q.changePercentage)}
              </span>
            </li>
          );
        })}
        {avg !== null && (
          <li className="market-strip-item market-strip-qscore" title="Average QScore composite across the entire mid+large-cap universe scored daily">
            <span className="market-strip-label">QScore Avg</span>
            <span className="market-strip-level">{avg.toFixed(1)}</span>
            <span className="market-strip-change neutral">/ 100</span>
          </li>
        )}
      </ul>
    </aside>
  );
}
