import Link from "next/link";
import type { ScoreboardPick } from "@/data/categories";
import type { Signal } from "@/lib/scoring";

const SIGNAL_LABEL: Record<Signal, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

const SIGNAL_TONE: Record<Signal, "bullish" | "bearish" | "neutral"> = {
  BUY_LONG_TERM: "bullish",
  BUY_SHORT_TERM: "bullish",
  HOLD: "neutral",
  SHORT: "bearish",
};

function factorTone(score: number): "green" | "amber" | "red" {
  if (score >= 65) return "green";
  if (score >= 40) return "amber";
  return "red";
}

export default function ScoreboardCard({ pick }: { pick: ScoreboardPick }) {
  const tone = SIGNAL_TONE[pick.signal];
  return (
    <Link
      href={`/score/${pick.ticker}`}
      className={`scoreboard-card tone-${tone}`}
      aria-label={`Open the full QScore breakdown for ${pick.ticker}`}
    >
      <header className="scoreboard-card-head">
        <div className="scoreboard-card-id">
          <span className="scoreboard-ticker">{pick.ticker}</span>
          <span className="scoreboard-company">{pick.companyName}</span>
        </div>
        <div className={`scoreboard-composite tone-${tone}`}>
          <span className="composite-num">{pick.composite}</span>
          <span className="composite-suffix">/100</span>
        </div>
      </header>

      <div className={`scoreboard-signal tone-${tone}`}>
        {SIGNAL_LABEL[pick.signal]}
      </div>

      <ul className="scoreboard-factors">
        {pick.categories.map((c) => (
          <li key={c.name}>
            <span className="factor-label">{c.label}</span>
            <span className={`factor-score ${factorTone(c.score)}`}>{c.score}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
