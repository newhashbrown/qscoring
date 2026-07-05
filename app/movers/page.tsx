import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import MoverCard from "@/app/components/MoverCard";
import MoversBoard from "@/app/components/MoversBoard";
import { loadLatestMovers } from "@/lib/movers-data";
import { isDivergence, type MoverRow } from "@/lib/movers-board";
import { formatMarketDate } from "@/lib/market-date";

// STATIC, like /performance: the committed data/movers/latest.json is read at
// BUILD time and baked into the page. This is deliberate — taking searchParams
// (e.g. ?date=) would force dynamic rendering, and the data-file fs read isn't
// available at request time on Workers (it would fall back to the empty state).
// A dated-history view should be a static /movers/[date] route, not a query param.
export const revalidate = 86400;

const DESCRIPTION =
  "Each trading day's biggest movers in our scored universe, reconciled against " +
  "the model's prior-day factor scores. Surfaces divergences — moves that run " +
  "counter to what the QScore already showed.";

export const metadata = {
  title: "Movers vs. Fundamentals — QScore",
  description: DESCRIPTION,
  alternates: { canonical: "https://qscoring.com/movers" },
  openGraph: {
    title: "Movers vs. Fundamentals — QScore",
    description: DESCRIPTION,
    url: "https://qscoring.com/movers",
    siteName: "QScoring",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Movers vs. Fundamentals — QScore",
    description: DESCRIPTION,
  },
};

function divergenceCount(rows: MoverRow[]): number {
  return rows.filter((r) => isDivergence(r.alignment)).length;
}

export default function MoversPage() {
  const data = loadLatestMovers();

  if (!data) {
    return (
      <>
        <div className="glow-orb green" />
        <ScoreNav />
        <main className="movers">
          <header className="movers-header">
            <h1>Movers vs. Fundamentals</h1>
            <p className="movers-lede">
              No movers data is available yet. Once daily snapshots accrue, this page
              compares each day&apos;s biggest movers against the model&apos;s prior read.
            </p>
            <p>
              <Link href="/scores">Browse scored stocks →</Link>
            </p>
          </header>
        </main>
        <footer>
          <p>© 2026 QScoring.com. All rights reserved.</p>
        </footer>
      </>
    );
  }

  const gDiv = divergenceCount(data.gainers);
  const lDiv = divergenceCount(data.losers);
  const totalDiv = gDiv + lDiv;

  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />
      <ScoreNav />

      <main className="movers">
        <header className="movers-header">
          <h1>Movers vs. Fundamentals</h1>
          <p className="movers-meta">
            <span className="movers-date">{formatMarketDate(data.date)}</span>
            <span className="sep" aria-hidden="true">·</span>
            model scores as of {data.scoreDate}
            <span className="sep" aria-hidden="true">·</span>
            {data.universeSize.toLocaleString()} names screened
          </p>
          <p className="movers-lede">
            The biggest movers in our scored universe, set against what the model already
            thought as of the prior close. The cases worth a second look are the{" "}
            <strong>divergences</strong>: a stock rising that the model rated weak, or
            falling that it rated strong. This is descriptive analysis, not advice.
          </p>
        </header>

        <MoversBoard totalDivergences={totalDiv}>
          <section className="movers-col" aria-labelledby="gainers-h">
            <h2 id="gainers-h" className="movers-col-head up">
              Gainers <span className="movers-col-n">{data.gainers.length}</span>
            </h2>
            <div className="movers-col-grid">
              {data.gainers.map((r) => (
                <MoverCard key={r.ticker} row={r} />
              ))}
            </div>
            {gDiv === 0 && (
              <p className="movers-empty-filtered">No divergences among the session&apos;s gainers.</p>
            )}
          </section>

          <section className="movers-col" aria-labelledby="losers-h">
            <h2 id="losers-h" className="movers-col-head down">
              Losers <span className="movers-col-n">{data.losers.length}</span>
            </h2>
            <div className="movers-col-grid">
              {data.losers.map((r) => (
                <MoverCard key={r.ticker} row={r} />
              ))}
            </div>
            {lDiv === 0 && (
              <p className="movers-empty-filtered">No divergences among the session&apos;s losers.</p>
            )}
          </section>
        </MoversBoard>
      </main>

      <footer>
        <nav aria-label="Footer">
          <p className="footer-links">
            <Link href="/methodology">Methodology</Link>
            <span className="sep" aria-hidden="true">·</span>
            <Link href="/performance">Performance</Link>
            <span className="sep" aria-hidden="true">·</span>
            <Link href="/scores">Scored stocks</Link>
            <span className="sep" aria-hidden="true">·</span>
            <Link href="/">QScoring</Link>
          </p>
        </nav>
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes
          only. It does not constitute investment advice, a recommendation, or a solicitation
          to buy or sell any security. Past performance and quantitative scores do not
          guarantee future results.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
