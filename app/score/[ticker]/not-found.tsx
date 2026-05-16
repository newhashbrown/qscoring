import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";

export default function ScoreNotFound() {
  return (
    <>
      <div className="glow-orb green" />
      <ScoreNav />
      <main className="score-error">
        <h1>Ticker not found</h1>
        <p>
          We couldn&apos;t find that stock symbol. Double-check the ticker, or try one of
          these:
        </p>
        <p style={{ marginTop: 16 }}>
          {["AAPL", "NVDA", "TSLA", "MSFT"].map((t) => (
            <Link key={t} href={`/score/${t}`} className="popular-chip">
              {t}
            </Link>
          ))}
        </p>
        <p style={{ marginTop: 24 }}>
          <Link href="/score" className="score-error-back">
            ← Search for a ticker
          </Link>
        </p>
      </main>
      <footer>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
