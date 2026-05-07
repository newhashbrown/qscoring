import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ScoreNav from "@/app/components/ScoreNav";
import ScoreView from "@/app/components/ScoreView";
import Commentary, { CommentarySkeleton } from "@/app/components/Commentary";
import { scoreTicker, validateTicker } from "@/lib/scoring";
import { findBestMatch } from "@/lib/scoring/search";

export const revalidate = 900;

const SIGNAL_LABEL_META: Record<string, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const decoded = decodeURIComponent(ticker).trim();
  const t = decoded.toUpperCase();

  // Non-ticker queries (e.g. /score/google → redirects to GOOGL) get generic
  // metadata; the redirected ticker page renders its own specific metadata.
  if (!isLikelyTicker(decoded)) {
    return {
      title: `${decoded} Quant Score — QScoring`,
      description: `Search results and quantitative analysis for ${decoded} on QScoring.`,
    };
  }

  try {
    const result = await scoreTicker(t);
    const signal = SIGNAL_LABEL_META[result.signal] ?? result.signal;
    const cat = (n: string) =>
      Math.round(result.categories.find((c) => c.name === n)?.score ?? 0);
    const title = `${result.ticker} QScore ${result.composite}/100 — ${signal} | QScoring`;
    const description =
      `${result.companyName} (${result.ticker}) quantitative analysis. ` +
      `QScore ${result.composite}/100, ${signal} signal, ${result.confidence} confidence. ` +
      `Value ${cat("value")} · Growth ${cat("growth")} · Momentum ${cat("momentum")} · ` +
      `Profitability ${cat("profitability")} · Risk ${cat("risk")}.`;
    const url = `https://qscoring.com/score/${result.ticker}`;

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        siteName: "QScoring",
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  } catch {
    return {
      title: `${t} Quant Score — QScoring`,
      description: `QScoring quantitative analysis for ${t}: composite score, buy/hold/short signal, and factor breakdown across value, growth, momentum, profitability, and risk.`,
    };
  }
}

// Names that need to be searched rather than scored directly.
function isLikelyTicker(s: string): boolean {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(s.toUpperCase());
}

async function resolveBySearch(query: string): Promise<string | null> {
  try {
    const match = await findBestMatch(query);
    return match?.symbol ?? null;
  } catch {
    return null;
  }
}

export default async function TickerScorePage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const decoded = decodeURIComponent(rawTicker).trim();

  // If the input doesn't look like a ticker (e.g., "Apple", "Johnson & Johnson"),
  // search FMP and redirect to the top match.
  if (!isLikelyTicker(decoded)) {
    const matchedSymbol = await resolveBySearch(decoded);
    if (matchedSymbol) redirect(`/score/${matchedSymbol}`);
    notFound();
  }

  let ticker: string;
  try {
    ticker = validateTicker(decoded);
  } catch {
    notFound();
  }

  let result;
  try {
    result = await scoreTicker(ticker);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // If FMP doesn't have data for this exact symbol, try fuzzy search before
    // showing the error UI. Common case: user types "APPLE" instead of "AAPL".
    if (/no profile|not found/i.test(message)) {
      const matchedSymbol = await resolveBySearch(decoded);
      if (matchedSymbol && matchedSymbol !== ticker) {
        redirect(`/score/${matchedSymbol}`);
      }
    }

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

  const signalProse = SIGNAL_LABEL_META[result.signal] ?? result.signal;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    headline: `${result.ticker} QScore: ${result.composite}/100, ${signalProse} signal`,
    datePublished: result.generatedAt,
    dateModified: result.generatedAt,
    author: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
    publisher: {
      "@type": "Organization",
      name: "QScoring",
      url: "https://qscoring.com",
    },
    about: {
      "@type": "Corporation",
      name: result.companyName,
      tickerSymbol: result.ticker,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://qscoring.com/score/${result.ticker}`,
    },
    description: `Composite QScore ${result.composite}/100 with ${signalProse} signal at ${result.confidence} confidence.`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav ticker={ticker} />

      <main>
        <ScoreView data={result} />
        <div className="commentary-wrap">
          <Suspense fallback={<CommentarySkeleton />}>
            <Commentary scoreResult={result} />
          </Suspense>
        </div>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/score">Score another ticker</Link>
          <span className="sep">·</span>
          <Link href="/">Home</Link>
        </p>
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
