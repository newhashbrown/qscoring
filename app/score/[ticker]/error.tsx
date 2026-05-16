"use client";

import Link from "next/link";
import { useEffect } from "react";
import ScoreNav from "@/app/components/ScoreNav";

export default function ScoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <div className="glow-orb green" />
      <ScoreNav />
      <main className="score-error">
        <h1>Something went wrong</h1>
        <p className="error-detail">{error.message || "An unexpected error occurred."}</p>
        <p>
          <button type="button" onClick={reset} className="popular-chip score-error-retry">
            Try again
          </button>
        </p>
        <p style={{ marginTop: 16 }}>
          Or try one of these:{" "}
          {["AAPL", "NVDA", "TSLA"].map((t) => (
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
