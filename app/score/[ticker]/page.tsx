import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreNav from "@/app/components/ScoreNav";
import ScoreView from "@/app/components/ScoreView";
import { scoreTicker, validateTicker } from "@/lib/scoring";

export const revalidate = 900;
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  return {
    title: `${t} Quant Score — QScoring`,
    description: `QScoring quantitative analysis for ${t}: composite score, buy/hold/short signal, and factor breakdown across value, growth, momentum, profitability, and risk.`,
  };
}

export default async function TickerScorePage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  let ticker: string;
  try {
    ticker = validateTicker(rawTicker);
  } catch {
    notFound();
  }

  let result;
  try {
    result = await scoreTicker(ticker);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <>
        <div className="glow-orb green" />
        <ScoreNav ticker={ticker} />
        <main className="score-error">
          <h1>Couldn&apos;t score {ticker}</h1>
          <p className="error-detail">{message}</p>
          <p>
            Double-check the ticker symbol, or try one of these:{" "}
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

  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav ticker={ticker} />

      <main>
        <ScoreView data={result} />
      </main>

      <footer>
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice, a recommendation, or a solicitation to buy or
          sell any security. Past performance and quantitative scores do not guarantee future
          results. Always conduct your own research and consult a licensed financial advisor before
          making investment decisions.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
