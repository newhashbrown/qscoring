import Link from "next/link";
import scoreboardData from "@/data/scoreboard.json";
import type { ScoreboardPick } from "@/data/categories";

// Internal-linking module for /score/[ticker]: cross-links each ticker page to
// sector peers (and, when a sector is thin, to similar-QScore names) so the
// 2,000+ leaf pages form an interlinked mesh instead of dead ends. Reads the
// build-time scoreboard; no client JS.

const PICKS = scoreboardData.picks as ScoreboardPick[];
const MAX = 8;

function band(score: number): "buy" | "hold" | "short" {
  if (score >= 65) return "buy";
  if (score >= 40) return "hold";
  return "short";
}

export default function RelatedStocks({
  ticker,
  sector,
  composite,
}: {
  ticker: string;
  sector: string | null;
  composite: number;
}) {
  const self = ticker.toUpperCase();
  const target = Math.round(composite);
  const taken = new Set<string>([self]);
  let related: ScoreboardPick[] = [];
  let heading = "Related stocks";

  if (sector) {
    related = PICKS.filter((p) => p.sector === sector && !taken.has(p.ticker.toUpperCase()))
      .sort((a, b) => b.composite - a.composite)
      .slice(0, MAX);
    related.forEach((p) => taken.add(p.ticker.toUpperCase()));
    if (related.length > 0) heading = `More ${sector} stocks`;
  }

  // Fill from nearest-QScore names when the sector is thin (or absent).
  if (related.length < 4) {
    const extra = PICKS.filter((p) => !taken.has(p.ticker.toUpperCase()))
      .sort((a, b) => Math.abs(a.composite - target) - Math.abs(b.composite - target))
      .slice(0, MAX - related.length);
    related = [...related, ...extra];
    if (!sector) heading = "Stocks with a similar QScore";
  }

  if (related.length === 0) return null;

  return (
    <section className="related-stocks" aria-labelledby="related-heading">
      <h2 id="related-heading">{heading}</h2>
      <ul className="related-grid">
        {related.map((p) => (
          <li key={p.ticker}>
            <Link href={`/score/${p.ticker}`} className="related-card">
              <span className="related-top">
                <span className="related-ticker">{p.ticker}</span>
                <span className={`related-score tone-${band(p.composite)}`}>{p.composite}</span>
              </span>
              <span className="related-name">{p.companyName}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
