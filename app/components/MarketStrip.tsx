import { fmp, type Quote } from "@/lib/scoring/fmp";
import { isRegularSessionOpen } from "@/lib/market-date";
import { MARKET_STRIP_ENABLED } from "@/lib/feature-flags";
import marketStripData from "@/data/market-strip.json";

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

// The universe-average composite is precomputed nightly by
// scripts/build-strong-picks.ts into data/market-strip.json (a few bytes),
// so this component no longer imports the full ~700KB scoreboard.json just to
// reduce it to a single number on every page render. The layout renders this
// strip site-wide; coupling it to the entire scoreboard put that whole dataset
// in the layout's module graph.
function universeAverage(): number | null {
  const avg = marketStripData.averageComposite;
  return typeof avg === "number" && Number.isFinite(avg) ? avg : null;
}

export default async function MarketStrip() {
  if (!MARKET_STRIP_ENABLED) return null;

  const quotes = await Promise.all(INDICES.map((i) => fetchIndexQuote(i.symbol)));
  const avg = universeAverage();

  // Whether the US market is in a regular session right now. Like the quotes
  // themselves this is captured at render and refreshes on the ~15-min ISR
  // revalidation, so it can lag the 9:30/16:00 ET boundary by a few minutes —
  // fine for a status badge. When closed, the levels above are the last
  // settled close (not stale data), which the badge's tooltip makes explicit.
  const marketOpen = isRegularSessionOpen(new Date());

  // If every quote failed (FMP outage or rate-limit) and we have no
  // universe average either, render nothing — better than a strip of
  // dashes. The page below renders normally without us.
  const hasAnyData = quotes.some((q) => q !== null) || avg !== null;
  if (!hasAnyData) return null;

  return (
    <aside className="market-strip" aria-label="Market context">
      <ul className="market-strip-row">
        <li
          className="market-strip-item market-strip-status"
          title={
            marketOpen
              ? "US market is open — index levels update through the session"
              : "US market is closed — showing the last settled close"
          }
        >
          <span className={`market-strip-change ${marketOpen ? "up" : "neutral"}`}>
            {marketOpen ? "● Open" : "● Closed"}
          </span>
        </li>
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
