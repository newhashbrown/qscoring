import { safeJsonLdString } from "@/lib/json-ld";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreNav from "@/app/components/ScoreNav";
import type { WeeklyRecap } from "@/lib/recaps";
import { formatMarketDate } from "@/lib/market-date";

const RECAPS_DIR = path.resolve(process.cwd(), "data", "recaps");

function listRecapDates(): string[] {
  if (!fs.existsSync(RECAPS_DIR)) return [];
  return fs
    .readdirSync(RECAPS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""));
}

function loadRecap(week: string): WeeklyRecap | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  const file = path.join(RECAPS_DIR, `${week}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as WeeklyRecap;
}

export function generateStaticParams() {
  return listRecapDates().map((week) => ({ week }));
}

export async function generateMetadata({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const recap = loadRecap(week);
  if (!recap) {
    return {
      title: "Recap not found — QScoring",
      robots: { index: false, follow: true },
    };
  }
  const dateLabel = formatMarketDate(recap.weekEnding);
  return {
    title: `Week ending ${dateLabel} — QScore Forward Recap`,
    description: `What QScoring's signals said the week of ${dateLabel}, what the stocks actually did, and the running hit rate. ${recap.rowCount} tickers tracked.`,
    alternates: { canonical: `https://qscoring.com/blog/recaps/${recap.weekEnding}` },
    openGraph: {
      title: `Week ending ${dateLabel} — QScore Forward Recap`,
      description: `Forward-tracked QScore performance: ${recap.rowCount} tickers, signal hit rates, top movers.`,
      url: `https://qscoring.com/blog/recaps/${recap.weekEnding}`,
      siteName: "QScoring",
      type: "article",
      publishedTime: recap.endGeneratedAt,
    },
  };
}

const SIGNAL_LABEL: Record<string, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

function fmtPct(n: number, decimals = 2): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(decimals)}%`;
}

function returnTone(r: number): "up" | "down" | "flat" {
  if (r > 0.001) return "up";
  if (r < -0.001) return "down";
  return "flat";
}

export default async function RecapDetailPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const recap = loadRecap(week);
  if (!recap) notFound();

  const dateLabel = formatMarketDate(recap.weekEnding);
  const startDateLabel = formatMarketDate(recap.startSnapshotDate);
  const universeMove = recap.endUniverseAvg - recap.startUniverseAvg;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `https://qscoring.com/blog/recaps/${recap.weekEnding}`,
    headline: `Week ending ${dateLabel} — QScore Forward Recap`,
    description: `Forward-tracked performance of the QScore signals across ${recap.rowCount} tickers from ${startDateLabel} to ${dateLabel}.`,
    datePublished: recap.endGeneratedAt,
    dateModified: recap.endGeneratedAt,
    author: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
    publisher: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://qscoring.com/blog/recaps/${recap.weekEnding}`,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://qscoring.com/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://qscoring.com/blog" },
      { "@type": "ListItem", position: 3, name: "Weekly recaps", item: "https://qscoring.com/blog/recaps" },
      {
        "@type": "ListItem",
        position: 4,
        name: `Week ending ${dateLabel}`,
        item: `https://qscoring.com/blog/recaps/${recap.weekEnding}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(breadcrumbJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology recap-page">
        <header className="method-header">
          <p className="method-eyebrow">
            <Link href="/blog/recaps">Weekly recaps</Link>
          </p>
          <h1>Week ending {dateLabel}</h1>
          <p className="method-lede">
            Forward-tracked QScore performance from {startDateLabel} to {dateLabel}.{" "}
            {recap.rowCount} tickers paired across both snapshots. The accountability
            framing: every signal in the &ldquo;Start signal&rdquo; column was committed to
            public source control on {startDateLabel} — what the stocks did between then and
            now is the answer.
          </p>
        </header>

        <section className="recap-stats">
          <div className="recap-stat">
            <span className="recap-stat-label">Universe Avg start</span>
            <span className="recap-stat-value">{recap.startUniverseAvg.toFixed(1)}</span>
          </div>
          <div className="recap-stat">
            <span className="recap-stat-label">Universe Avg end</span>
            <span className="recap-stat-value">{recap.endUniverseAvg.toFixed(1)}</span>
          </div>
          <div className="recap-stat">
            <span className="recap-stat-label">Move</span>
            <span className={`recap-stat-value ${returnTone(universeMove)}`}>
              {universeMove >= 0 ? "+" : ""}
              {universeMove.toFixed(1)}
            </span>
          </div>
          <div className="recap-stat">
            <span className="recap-stat-label">Tickers tracked</span>
            <span className="recap-stat-value">{recap.rowCount}</span>
          </div>
        </section>

        <section>
          <h2>Signal hit rate</h2>
          <p>
            For each directional signal (Hold excluded — Hold has no direction), the table
            below shows how often the call was right. A &ldquo;hit&rdquo; for a Buy signal is a
            positive forward return; for Short, a negative one.
          </p>
          <table className="method-table recap-hits">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Count</th>
                <th>Correct</th>
                <th>Hit rate</th>
                <th>Avg return</th>
              </tr>
            </thead>
            <tbody>
              {recap.hitStats.map((h) => (
                <tr key={h.signal}>
                  <td>{SIGNAL_LABEL[h.signal] ?? h.signal}</td>
                  <td>{h.count}</td>
                  <td>{h.correctCount}</td>
                  <td>{h.count > 0 ? `${(h.hitRate * 100).toFixed(0)}%` : "—"}</td>
                  <td className={returnTone(h.averageReturn)}>
                    {h.count > 0 ? fmtPct(h.averageReturn) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="recap-note">
            <strong>Note:</strong> hit rates from a single week are noise. Statistical
            significance comes from accumulating many weeks of these — see the{" "}
            <Link href="/methodology#validation">validation pledge</Link> for the formal IC
            and quintile-spread thresholds we&apos;ll publish before subscription billing
            turns on.
          </p>
        </section>

        <section className="recap-extremes">
          <div>
            <h2>Best 5 movers</h2>
            <RecapMoverList rows={recap.bestMovers} />
          </div>
          <div>
            <h2>Worst 5 movers</h2>
            <RecapMoverList rows={recap.worstMovers} />
          </div>
        </section>

        {recap.signalFlips.length > 0 && (
          <section>
            <h2>Signals that flipped during the week ({recap.signalFlips.length})</h2>
            <table className="method-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Was</th>
                  <th>Now</th>
                  <th>Composite</th>
                  <th>Forward return</th>
                </tr>
              </thead>
              <tbody>
                {recap.signalFlips.map((r) => (
                  <tr key={r.ticker}>
                    <td>
                      <Link href={`/score/${r.ticker}`}>{r.ticker}</Link>
                    </td>
                    <td>{SIGNAL_LABEL[r.startSignal] ?? r.startSignal}</td>
                    <td>{SIGNAL_LABEL[r.endSignal] ?? r.endSignal}</td>
                    <td>
                      {r.startComposite} → {r.endComposite}
                    </td>
                    <td className={returnTone(r.forwardReturn)}>{fmtPct(r.forwardReturn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="back-to-top">
          <Link href="/blog/recaps">← All weekly recaps</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/blog/recaps">Recaps</Link>
          <span className="sep">·</span>
          <Link href="/performance">Performance</Link>
          <span className="sep">·</span>
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/glossary">Glossary</Link>
        </p>
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes
          only. Forward-tracked recaps are a measurement record, not a backtest, and should
          not be interpreted as a strategy track record.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}

function RecapMoverList({
  rows,
}: {
  rows: WeeklyRecap["bestMovers"];
}) {
  return (
    <ul className="recap-mover-list">
      {rows.map((r) => (
        <li key={r.ticker}>
          <Link href={`/score/${r.ticker}`} className="recap-mover-row">
            <span className="recap-mover-ticker">{r.ticker}</span>
            <span className="recap-mover-name">{r.companyName}</span>
            <span className="recap-mover-signal">{SIGNAL_LABEL[r.startSignal] ?? r.startSignal}</span>
            <span className={`recap-mover-return ${returnTone(r.forwardReturn)}`}>
              {fmtPct(r.forwardReturn)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
