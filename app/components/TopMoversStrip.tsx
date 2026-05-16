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

// UTC timestamp for the snapshot caption — keeps SSR and CSR identical so
// hydration matches without needing suppressHydrationWarning. Format is
// stable enough to spot drift visually next to the detail page's
// generatedAt.
function formatBatchTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${date}, ${time} UTC`;
}

export default async function TopMoversStrip() {
  let batch;
  try {
    batch = await computeMovers(4);
  } catch {
    return null;
  }
  if (!batch || batch.movers.length === 0) return null;

  const { movers, generatedAt } = batch;

  return (
    <section className="movers-section">
      <div className="movers-label">
        <span className="movers-pulse" /> QScore Movers · Today
        <span className="movers-timestamp" title={generatedAt}>
          as of {formatBatchTimestamp(generatedAt)}
        </span>
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
                <span className="mover-name" title={m.companyName}>{m.companyName}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
