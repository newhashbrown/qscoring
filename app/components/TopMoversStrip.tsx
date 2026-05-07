import Link from "next/link";
import { computeMovers } from "@/lib/scoring/movers";

// Refresh once an hour. Heavy compute (35 tickers × 6 FMP calls) — but each
// underlying fetch is cached, so repeated runs within the cache window are
// effectively free.
export const revalidate = 3600;

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
