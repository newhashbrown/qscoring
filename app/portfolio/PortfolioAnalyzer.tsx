"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  MAX_PORTFOLIO_ENTRIES,
  parsePortfolioInput,
  type PortfolioAnalysis,
  type PortfolioMode,
} from "@/lib/portfolio";

const SIGNAL_LABEL: Record<string, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

const SIGNAL_TONE: Record<string, "bullish" | "bearish" | "neutral"> = {
  BUY_LONG_TERM: "bullish",
  BUY_SHORT_TERM: "bullish",
  HOLD: "neutral",
  SHORT: "bearish",
};

const FACTOR_LABEL: Record<string, string> = {
  value: "Value",
  growth: "Growth",
  momentum: "Momentum",
  profitability: "Profitability",
  risk: "Risk",
};

function factorTone(score: number): "green" | "amber" | "red" {
  if (score >= 65) return "green";
  if (score >= 40) return "amber";
  return "red";
}

const MODE_PLACEHOLDER: Record<PortfolioMode, string> = {
  equal: `# Equal-weight mode — just paste tickers, one per line.
# Comments start with #.

AAPL
NVDA
MSFT
GOOGL
AMZN`,
  weights: `# Weights mode — TICKER WEIGHT, one per line.
# Weights can be percentages or any positive numbers; we normalize.

AAPL 15
NVDA 12
MSFT 10
GOOGL 8
AMZN 8`,
  shares: `# Shares mode — TICKER QUANTITY, one per line.
# We multiply by the current price to get position value, then derive weights.
# Pasting a brokerage row works too — we take the first number after the symbol.

AAPL 10
NVDA 6
MSFT 3
MO 50
PFE 25`,
  values: `# Dollar values mode — TICKER VALUE, one per line.
# Use the dollar amount of the position; we normalize across the portfolio.
# $ signs and 1,234.56-style commas are fine.

AAPL $2,150.40
NVDA $2,732.00
MSFT $1,245.36
MO $1,021.80`,
};

const MODE_LABEL: Record<PortfolioMode, string> = {
  equal: "Equal weight",
  weights: "Weights",
  shares: "Shares",
  values: "Dollar values",
};

const MODE_HINT: Record<PortfolioMode, string> = {
  equal: "Just tickers, one per line. Equal weight per holding.",
  weights: "TICKER WEIGHT per line. Weights are normalized to sum to 100%.",
  shares: "TICKER QUANTITY per line. We multiply by current price to derive weights.",
  values: "TICKER VALUE per line. Use the dollar value of each position.",
};

type Status = "idle" | "submitting" | "success" | "error";

const MODES: PortfolioMode[] = ["equal", "weights", "shares", "values"];

export default function PortfolioAnalyzer() {
  const [mode, setMode] = useState<PortfolioMode>("shares");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMessage("");
    setAnalysis(null);

    const parsed = parsePortfolioInput(text, mode);
    setParseErrors(parsed.errors);

    if (parsed.entries.length === 0) {
      setStatus("error");
      setErrorMessage("No valid tickers found. Each line should be a ticker symbol like AAPL.");
      return;
    }

    try {
      const res = await fetch("/api/portfolio/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          entries: parsed.entries.map((e) => ({
            ticker: e.ticker,
            rawNumber: e.rawNumber,
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        analysis?: PortfolioAnalysis;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.analysis) {
        setStatus("error");
        setErrorMessage(json.error ?? `Analysis failed (HTTP ${res.status}).`);
        return;
      }
      setAnalysis(json.analysis);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Network error — try again in a moment.");
    }
  }

  return (
    <>
      <form className="portfolio-form" onSubmit={handleSubmit}>
        <fieldset className="portfolio-mode-row">
          <legend className="portfolio-label">Input format</legend>
          <div className="portfolio-mode-options">
            {MODES.map((m) => (
              <label key={m} className={`portfolio-mode-pill ${mode === m ? "active" : ""}`}>
                <input
                  type="radio"
                  name="portfolio-mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {MODE_LABEL[m]}
              </label>
            ))}
          </div>
          <p className="portfolio-mode-hint">{MODE_HINT[mode]}</p>
        </fieldset>

        <label className="portfolio-label" htmlFor="portfolio-input">
          Your portfolio
          <span className="portfolio-hint">
            Max {MAX_PORTFOLIO_ENTRIES} entries — paste a brokerage row or just the values
          </span>
        </label>
        <textarea
          id="portfolio-input"
          className="portfolio-input"
          rows={12}
          spellCheck={false}
          placeholder={MODE_PLACEHOLDER[mode]}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={status === "submitting"}
        />
        <div className="portfolio-actions">
          <button
            type="submit"
            className="portfolio-submit"
            disabled={status === "submitting" || text.trim().length === 0}
          >
            {status === "submitting" ? "Analyzing…" : "Analyze portfolio →"}
          </button>
          <span className="portfolio-stateless">
            Stateless — we don&apos;t store your holdings.
          </span>
        </div>
        {status === "error" && errorMessage && (
          <p className="portfolio-error" role="alert">{errorMessage}</p>
        )}
        {parseErrors.length > 0 && (
          <ul className="portfolio-parse-errors">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </form>

      {analysis && <Result analysis={analysis} />}
    </>
  );
}

// Mapping signal → one-sentence explanation of what the QScore framework
// is saying about that position. Carefully phrased as "what the model
// thinks" rather than "what you should do" — see the disclaimer next to
// the table. Tone classes drive the colored left-edge stripe.
const SIGNAL_CONTEXT: Record<string, { phrase: string; tone: "bullish" | "bearish" | "neutral" }> = {
  BUY_LONG_TERM: {
    phrase:
      "Model rates a Buy on the long-term composite. Holding aligns with the signal; adding aligns with it.",
    tone: "bullish",
  },
  BUY_SHORT_TERM: {
    phrase:
      "Model rates a Buy on the short-term composite, driven by momentum. Holding aligns with the signal.",
    tone: "bullish",
  },
  HOLD: {
    phrase:
      "Model has no decisive view. Neither buy nor short composite crosses its threshold.",
    tone: "neutral",
  },
  SHORT: {
    phrase:
      "Model rates Short — the composite signals the position is unattractive on the current factor mix. Holding contradicts the signal.",
    tone: "bearish",
  },
};

function PerPositionTable({ rows }: { rows: PortfolioAnalysis["rows"] }) {
  const scored = rows.filter((r) => r.pick !== null);
  if (scored.length === 0) return null;
  // Sort by composite descending so the strongest-rated holding is at the
  // top and the weakest is at the bottom.
  const sorted = [...scored].sort(
    (a, b) => (b.pick?.composite ?? 0) - (a.pick?.composite ?? 0)
  );

  return (
    <section className="portfolio-block portfolio-positions">
      <h2>What the model says about each holding</h2>
      <p className="portfolio-block-lede">
        QScore signal per position, sorted by composite. This is{" "}
        <strong>what the model says</strong> based on the five-factor breakdown — not a
        personalized recommendation. Click any ticker for the full breakdown.
      </p>

      <div className="position-table" role="table" aria-label="Per-position QScore signals">
        <div className="position-row position-head" role="row">
          <span role="columnheader">Ticker</span>
          <span role="columnheader">Weight</span>
          <span role="columnheader">QScore</span>
          <span role="columnheader">Signal</span>
          <span role="columnheader">What the model says</span>
        </div>
        {sorted.map((r) => {
          const ctx = SIGNAL_CONTEXT[r.pick?.signal ?? "HOLD"];
          return (
            <div key={r.ticker} className={`position-row tone-${ctx.tone}`} role="row">
              <Link href={`/score/${r.ticker}`} className="position-ticker" role="cell">
                {r.ticker}
              </Link>
              <span role="cell" className="position-weight">
                {(r.weight * 100).toFixed(1)}%
              </span>
              <span
                role="cell"
                className={`position-composite tone-${ctx.tone}`}
              >
                {r.pick?.composite}
              </span>
              <span role="cell" className={`position-signal tone-${ctx.tone}`}>
                {{ BUY_LONG_TERM: "Buy LT", BUY_SHORT_TERM: "Buy ST", HOLD: "Hold", SHORT: "Short" }[r.pick?.signal ?? "HOLD"]}
              </span>
              <span role="cell" className="position-context">
                {ctx.phrase}
              </span>
            </div>
          );
        })}
      </div>

      <p className="portfolio-positions-note">
        <strong>Important:</strong> the &ldquo;Signal&rdquo; column is what the QScore framework
        outputs based on factor scores — it&apos;s information, not investment advice. Whether
        to buy, hold, sell, or trim a position depends on your tax situation, time horizon,
        portfolio correlation, conviction, and risk tolerance — none of which the model knows
        about.
      </p>
    </section>
  );
}

function Result({ analysis }: { analysis: PortfolioAnalysis }) {
  const { aggregate, signalDistribution, sectorBreakdown, strongest, weakest, confidence, rows } =
    analysis;
  const compositeRounded = Math.round(aggregate.composite);
  const compositeTone = factorTone(compositeRounded) === "green" ? "bullish" : factorTone(compositeRounded) === "red" ? "bearish" : "neutral";
  const failedRows = rows.filter((r) => !r.pick);

  return (
    <section className="portfolio-result" aria-label="Portfolio analysis">
      <header className="portfolio-result-head">
        <div>
          <p className="portfolio-eyebrow">Aggregate QScore</p>
          <p className={`portfolio-composite tone-${compositeTone}`}>
            {compositeRounded}
            <span className="portfolio-composite-suffix">/100</span>
          </p>
        </div>
        <div className="portfolio-coverage">
          <p className="portfolio-eyebrow">Coverage</p>
          <p className="portfolio-coverage-value">
            {Math.round(confidence.coverageWeight * 100)}% of weight scored
          </p>
          {failedRows.length > 0 && (
            <p className="portfolio-coverage-note">
              {failedRows.length} ticker{failedRows.length === 1 ? "" : "s"} couldn&apos;t be scored
            </p>
          )}
        </div>
      </header>

      <section className="portfolio-block">
        <h2>Factor exposure</h2>
        <p className="portfolio-block-lede">
          Weighted average across your holdings. High scores (green) are tailwinds; low scores
          (red) are drags on the composite.
        </p>
        <ul className="portfolio-factor-list">
          {(["value", "growth", "momentum", "profitability", "risk"] as const).map((f) => {
            const score = Math.round(aggregate.factors[f] ?? 0);
            return (
              <li key={f}>
                <span className="portfolio-factor-label">{FACTOR_LABEL[f]}</span>
                <div className="portfolio-factor-bar">
                  <div
                    className={`portfolio-factor-fill ${factorTone(score)}`}
                    style={{ width: `${Math.max(2, score)}%` }}
                  />
                </div>
                <span className={`portfolio-factor-score ${factorTone(score)}`}>{score}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="portfolio-block">
        <h2>Signal mix</h2>
        <p className="portfolio-block-lede">Distribution of signals across your portfolio (by weight).</p>
        <ul className="portfolio-signal-list">
          {(["BUY_LONG_TERM", "BUY_SHORT_TERM", "HOLD", "SHORT"] as const).map((sig) => {
            const entry = signalDistribution[sig];
            const pct = Math.round(entry.weight * 100);
            return (
              <li key={sig} className={`tone-${SIGNAL_TONE[sig]}`}>
                <span className="portfolio-signal-label">{SIGNAL_LABEL[sig]}</span>
                <span className="portfolio-signal-count">
                  {entry.count} name{entry.count === 1 ? "" : "s"} · {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {sectorBreakdown.length > 0 && (
        <section className="portfolio-block">
          <h2>Sector concentration</h2>
          <ul className="portfolio-sector-list">
            {sectorBreakdown.map((s) => (
              <li key={s.sector}>
                <span className="portfolio-sector-name">{s.sector}</span>
                <div className="portfolio-sector-bar">
                  <div
                    className="portfolio-sector-fill"
                    style={{ width: `${Math.max(3, Math.round(s.weight * 100))}%` }}
                  />
                </div>
                <span className="portfolio-sector-pct">{Math.round(s.weight * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="portfolio-extremes">
        <section className="portfolio-block">
          <h2>Strongest holdings</h2>
          <ul className="portfolio-extreme-list">
            {strongest.map((r) => (
              <li key={r.ticker}>
                <Link href={`/score/${r.ticker}`} className="portfolio-extreme-row">
                  <span className="portfolio-extreme-ticker">{r.ticker}</span>
                  <span className="portfolio-extreme-name">{r.pick?.companyName}</span>
                  <span className={`portfolio-extreme-score tone-${SIGNAL_TONE[r.pick?.signal ?? "HOLD"]}`}>
                    {r.pick?.composite}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="portfolio-block">
          <h2>Weakest holdings</h2>
          <ul className="portfolio-extreme-list">
            {weakest.map((r) => (
              <li key={r.ticker}>
                <Link href={`/score/${r.ticker}`} className="portfolio-extreme-row">
                  <span className="portfolio-extreme-ticker">{r.ticker}</span>
                  <span className="portfolio-extreme-name">{r.pick?.companyName}</span>
                  <span className={`portfolio-extreme-score tone-${SIGNAL_TONE[r.pick?.signal ?? "HOLD"]}`}>
                    {r.pick?.composite}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <PerPositionTable rows={rows} />


      {failedRows.length > 0 && (
        <section className="portfolio-block portfolio-failures">
          <h2>Couldn&apos;t score</h2>
          <ul>
            {failedRows.map((r) => (
              <li key={r.ticker}>
                <strong>{r.ticker}</strong> — {r.error ?? "no score available"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="portfolio-disclaimer">
        Factor exposure analysis only — not investment advice, a recommendation, or a solicitation.
        Aggregate QScore is a weighted average of individual factor scores; treat it as a structured
        second opinion, not a strategy verdict. Read the{" "}
        <Link href="/methodology">methodology</Link> for how factors are computed.
      </p>
    </section>
  );
}
