import Link from "next/link";
import type { Signal } from "@/lib/scoring";
import type { Alignment, MoverRow, Stance } from "@/lib/movers-board";
import { isDivergence } from "@/lib/movers-board";

const SIGNAL_LABEL: Record<Signal, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

// Alignment is the focal element. Tone drives the badge colour:
// green = confirmed strength, red = confirmed weakness, amber = unsupported
// pop, blue = dislocation, gray = unscored. Labels are analysis terms — no
// buy/sell language.
const ALIGNMENT: Record<Alignment, { label: string; tone: string }> = {
  confirmed_strength: { label: "Confirmed strength", tone: "green" },
  confirmed_weakness: { label: "Confirmed weakness", tone: "red" },
  unsupported_pop: { label: "Unsupported pop", tone: "amber" },
  dislocation: { label: "Dislocation", tone: "blue" },
  unscored_pop: { label: "Unscored pop", tone: "gray" },
  unscored_drop: { label: "Unscored drop", tone: "gray" },
};

// Compact factor labels (mirrors ScoreboardCard's per-card budget).
const FACTORS: ReadonlyArray<{ key: keyof MoverRow["factors"]; label: string }> = [
  { key: "value", label: "VALUE" },
  { key: "growth", label: "GROWTH" },
  { key: "momentum", label: "MOMENT" },
  { key: "profitability", label: "PROFIT" },
  { key: "risk", label: "RISK" },
];

function stanceTone(stance: Stance | null): "bullish" | "bearish" | "neutral" {
  if (stance === "bullish") return "bullish";
  if (stance === "bearish") return "bearish";
  return "neutral";
}

function factorTone(score: number | null): string {
  if (score === null) return "muted";
  if (score >= 65) return "green";
  if (score >= 40) return "amber";
  return "red";
}

function fmtPct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : ""}${r}%`;
}

export default function MoverCard({ row }: { row: MoverRow }) {
  const up = row.dayReturnPct >= 0;
  const align = ALIGNMENT[row.alignment];
  const sTone = stanceTone(row.stance);

  return (
    <article
      className={`mover-card align-${align.tone}`}
      data-divergence={isDivergence(row.alignment) ? "true" : "false"}
    >
      <Link
        href={`/score/${row.ticker}`}
        className="mover-card-link"
        aria-label={`Open the full QScore breakdown for ${row.ticker}`}
      >
        <header className="mover-card-head">
          <div className="mover-id">
            <span className="mover-ticker">{row.ticker}</span>
            <span className="mover-company">{row.companyName}</span>
          </div>
          <span className={`mover-return ${up ? "up" : "down"}`}>
            {fmtPct(row.dayReturnPct)}
          </span>
        </header>

        <div className={`mover-align-badge align-${align.tone}`}>{align.label}</div>

        <p className="mover-note">{row.alignmentNote}</p>

        <div className="mover-model">
          <span className={`mover-composite tone-${sTone}`}>
            {row.priorComposite ?? "—"}
            <span className="composite-suffix">/100</span>
          </span>
          <span className={`mover-signal tone-${sTone}`}>
            {row.priorSignal ? SIGNAL_LABEL[row.priorSignal] : "Unscored"}
          </span>
          <span className="mover-scoredate">
            {row.scoreDate ? `model as of ${row.scoreDate}` : "no prior score"}
          </span>
        </div>

        <ul className="scoreboard-factors mover-factors">
          {FACTORS.map((f) => {
            const score = row.factors[f.key];
            return (
              <li key={f.key}>
                <span className="factor-label">{f.label}</span>
                <span className={`factor-score ${factorTone(score)}`}>{score ?? "—"}</span>
              </li>
            );
          })}
        </ul>
      </Link>
    </article>
  );
}
