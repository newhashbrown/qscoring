import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";

// Rendered instead of a score for tickers outside the QScore's model scope —
// fund/ETF share classes, SPACs/shells, delisted names (coverage.state ===
// "do_not_score"). No score, no factor breakdown, no JSON-LD. The page still
// exists (old links resolve) but is noindex'd (see generateMetadata).
export default function OutOfScopeNotice({
  ticker,
  companyName,
  reason,
}: {
  ticker: string;
  companyName?: string | null;
  reason: string;
}) {
  return (
    <>
      <div className="glow-orb green" />
      <ScoreNav ticker={ticker} />
      <main className="score-error">
        <h1>
          {ticker}
          {companyName ? ` — ${companyName}` : ""}
        </h1>
        <p className="oos-badge">Outside QScoring model scope</p>
        <p className="error-detail">{reason}</p>
        <p>
          The QScore models single-company operating fundamentals, so it isn&apos;t computed here.
          Try a US-listed operating company:{" "}
          {["AAPL", "NVDA", "JPM"].map((t) => (
            <Link key={t} href={`/score/${t}`} className="popular-chip">
              {t}
            </Link>
          ))}
        </p>
      </main>
      <footer>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
