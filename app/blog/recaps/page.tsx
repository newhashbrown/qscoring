import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import type { WeeklyRecap } from "@/lib/recaps";
import { formatMarketDate } from "@/lib/market-date";

export const metadata = {
  title: "Weekly QScore Recaps — Forward-Tracked Predictions vs Outcomes",
  description:
    "Public accountability log: every week we publish what the QScore signaled, what the stocks actually did, and the running hit rate. No look-ahead bias possible — both snapshots are committed to public source control on the day.",
  alternates: { canonical: "https://qscoring.com/blog/recaps" },
};

// Daily revalidation so newly-committed recap files appear without a
// manual redeploy. fs.readdirSync runs at request-time on the worker.
export const revalidate = 86400;

const RECAPS_DIR = path.resolve(process.cwd(), "data", "recaps");

type RecapSummary = {
  weekEnding: string;
  startDate: string;
  rowCount: number;
  startAvg: number;
  endAvg: number;
};

function listRecaps(): RecapSummary[] {
  if (!fs.existsSync(RECAPS_DIR)) return [];
  const files = fs
    .readdirSync(RECAPS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  return files.map((f) => {
    const recap = JSON.parse(fs.readFileSync(path.join(RECAPS_DIR, f), "utf-8")) as WeeklyRecap;
    return {
      weekEnding: recap.weekEnding,
      startDate: recap.startSnapshotDate,
      rowCount: recap.rowCount,
      startAvg: recap.startUniverseAvg,
      endAvg: recap.endUniverseAvg,
    };
  });
}

export default function RecapsIndexPage() {
  const recaps = listRecaps();

  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology blog-cluster">
        <header className="method-header">
          <p className="method-eyebrow">
            <Link href="/blog">Blog</Link> · Recaps
          </p>
          <h1>Weekly forward-tracked recaps</h1>
          <p className="method-lede">
            Every Monday we publish what the QScore said the previous week, what the stocks
            actually did, and the running hit rate. The data lives in committed JSON files —{" "}
            <code>data/snapshots/</code> for the daily score captures, <code>data/recaps/</code>{" "}
            for these weekly aggregations. No look-ahead bias is mathematically possible
            because both snapshots are timestamped commits in public source control.
          </p>
        </header>

        {recaps.length === 0 ? (
          <section className="cluster-empty">
            <p>
              No recaps yet — the first one publishes after we have at least 7 days of snapshot
              history. Track progress on the{" "}
              <Link href="/performance">live performance page</Link>.
            </p>
          </section>
        ) : (
          <ul className="blog-list">
            {recaps.map((r) => {
              const move = r.endAvg - r.startAvg;
              const moveSign = move >= 0 ? "+" : "";
              return (
                <li key={r.weekEnding}>
                  <Link href={`/blog/recaps/${r.weekEnding}`} className="blog-list-item">
                    <span className="blog-list-meta">
                      Week ending {formatMarketDate(r.weekEnding)} · {r.rowCount} tickers
                    </span>
                    <span className="blog-list-title">
                      QScore Universe Avg {r.startAvg.toFixed(1)} → {r.endAvg.toFixed(1)} ({moveSign}
                      {move.toFixed(1)})
                    </span>
                    <span className="blog-list-excerpt">
                      Forward-return breakdown across the universe, signal hit rates, top and
                      bottom movers, and any signals that flipped during the week.
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="back-to-top">
          <Link href="/blog">← All clusters</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/blog">Blog</Link>
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
