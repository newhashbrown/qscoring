import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import { summarizePerformance } from "@/lib/performance";
import { formatMarketDate, marketCloseLabel } from "@/lib/market-date";

export const metadata = {
  title: "Live Performance Tracking — QScore",
  description:
    "Locked-in daily QScore snapshots and forward-return tracking. Every score and price below was committed to public source control on the date shown — no look-ahead bias is possible by construction.",
  alternates: { canonical: "https://qscoring.com/performance" },
};

// Re-render daily so the days-captured counter and horizon-availability
// flags advance as time passes. Snapshots themselves are committed by the
// daily GitHub Action so the data is already on disk by the time this page
// rebuilds.
export const revalidate = 86400;

const performanceJsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://qscoring.com/performance",
  headline: "QScore Live Performance Tracking",
  description:
    "Append-only ledger of daily QScore snapshots used to compute forward-return performance metrics with zero look-ahead bias.",
  author: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
  publisher: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return formatMarketDate(iso);
}

export default function PerformancePage() {
  const summary = summarizePerformance();
  const { trackedSinceDate, daysCaptured, totalObservations, averageTickersPerSnapshot, latestSnapshot, horizonStatus } = summary;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(performanceJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology performance-page">
        <header className="method-header">
          <p className="method-eyebrow">Performance</p>
          <h1>Live forward-return tracking</h1>
          <p className="method-lede">
            Every QScore and closing price below was committed to public source control on the date
            shown. No revisionism, no survivorship filtering, no look-ahead bias possible by
            construction. As trading days accrue, this page publishes information-coefficient and
            quintile-spread numbers against the locked-in scores — until the formal backtest in the
            <Link href="/methodology#validation"> methodology validation section</Link> lands.
          </p>
        </header>

        <section className="performance-stats">
          <div className="perf-stat">
            <div className="perf-stat-label">Tracking since</div>
            <div className="perf-stat-value">{formatDate(trackedSinceDate)}</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-label">Days captured</div>
            <div className="perf-stat-value">{daysCaptured}</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-label">Tickers per snapshot</div>
            <div className="perf-stat-value">{averageTickersPerSnapshot}</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-label">Total observations</div>
            <div className="perf-stat-value">{totalObservations.toLocaleString()}</div>
          </div>
        </section>

        <section>
          <h2>Forward-return horizons</h2>
          <p>
            Each horizon publishes information-coefficient (Spearman rank correlation between
            composite QScore at snapshot date and forward total return) and long-short
            quintile-spread metrics once enough trading days have passed. Until then the data is
            still accumulating and the table below shows the gap.
          </p>
          <table className="method-table performance-horizons">
            <thead>
              <tr>
                <th>Horizon</th>
                <th>Trading days needed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {horizonStatus.map((h) => (
                <tr key={h.label}>
                  <td>{h.label}</td>
                  <td>{h.days}</td>
                  <td>
                    {h.available ? (
                      <span className="horizon-ready">
                        Ready — IC + quintile computation pending
                      </span>
                    ) : (
                      <span className="horizon-waiting">
                        ~{h.daysRemaining} trading days remaining
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Why this is not a backtest</h2>
          <p>
            A backtest goes the other direction in time: it reconstructs what scores would have
            been at points in the past and pairs them with forward returns from those past points.
            That requires point-in-time fundamentals, an as-of-date pipeline, and a survivorship-
            inclusive universe — all hard to do honestly without specialized data. This page does
            something simpler and more bulletproof: it captures every score forward from this date
            and pairs them with the actual returns that follow.
          </p>
          <p>
            The trade-off is patience. Backtests can produce a number on day one. Forward tracking
            produces a credible 1-month IC number after roughly a calendar month of capture, a
            3-month IC after three calendar months, and so on. We&apos;re publishing the
            counter so that the wait is visible and the data is auditable as it grows.
          </p>
          <p>
            The full backtest is still on the roadmap — see the{" "}
            <Link href="/methodology#validation">validation pledge</Link> for the exact list of
            metrics required before subscription billing turns on.
          </p>
        </section>

        {latestSnapshot && (
          <section>
            <h2>Most recent snapshot</h2>
            <p>
              Reflects the {marketCloseLabel(latestSnapshot.generatedAt)}.
              Captured at {new Date(latestSnapshot.generatedAt).toISOString()}. Top 10 by
              composite — full snapshot file lives at{" "}
              <code>data/snapshots/{latestSnapshot.date}.json</code> in the public repository.
            </p>
            <table className="method-table latest-snapshot-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Composite</th>
                  <th>Signal</th>
                  <th>Long-term</th>
                  <th>Short-term</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {[...latestSnapshot.picks]
                  .sort((a, b) => b.composite - a.composite)
                  .slice(0, 10)
                  .map((p) => (
                    <tr key={p.ticker}>
                      <td>
                        <Link href={`/score/${p.ticker}`}>{p.ticker}</Link>
                      </td>
                      <td>{p.composite}</td>
                      <td>{p.signal.replace(/_/g, " ").toLowerCase()}</td>
                      <td>{p.longTermScore ?? "—"}</td>
                      <td>{p.shortTermScore ?? "—"}</td>
                      <td>${p.price.toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="back-to-top">
          <Link href="/methodology#validation">Read the full validation pledge →</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/scores">Categories</Link>
          <span className="sep">·</span>
          <Link href="/compare">Compare</Link>
          <span className="sep">·</span>
          <Link href="/glossary">Glossary</Link>
        </p>
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice. Forward-return data published here is a
          measurement record, not a backtest, and should not be interpreted as a strategy track
          record.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
