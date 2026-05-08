import Link from "next/link";
import { computeMovers } from "@/lib/scoring/movers";

// Refresh on the same 15-minute cadence as the score detail page. Movers
// and detail pages share the same underlying FMP fetches via Next's data
// cache, so this just keeps the rendered numbers in sync — without it,
// movers can show a TSLA composite that's up to 45 minutes behind the
// detail page's value, which looks like a bug to anyone comparing the two.
// FMP load doesn't grow because the underlying fetches are cache-shared.
export const revalidate = 900;

function deltaLabel(delta: number): string {
  const rounded = Math.round(Math.abs(delta));
  return rounded === 0 ? "—" : `${delta >= 0 ? "+" : "−"}${rounded}`;
}

export default async function TopMoversStrip() {
  let movers;
  try {
    movers = await computeMovers(4);
  } catch {
    return null;
  }
  if (!movers || movers.length === 0) return null;

  return (
    <section className="movers-section">
      <div className="movers-label">
        <span className="movers-pulse" /> QScore Movers · Today
      </div>
      <div className="movers-grid">
        {movers.map((m) => {
          const up = m.delta >= 0;
          return (
            <Link key={m.ticker} href={`/score/${m.ticker}`} className="mover-card">
              <div className="mover-top">
                <div className="mover-ticker">{m.ticker}</div>
                <div className={`mover-delta ${up ? "up" : "down"}`}>
                  {up ? "▲" : "▼"} {deltaLabel(m.delta)}
                </div>
              </div>
              <div className="mover-score">{m.composite}</div>
              <div className="mover-meta">
                <span className="mover-name">{m.companyName}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
