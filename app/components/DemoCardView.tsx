import type { CategoryScore, ScoreResult, Signal } from "@/lib/scoring";

export type DemoData = Pick<
  ScoreResult,
  "ticker" | "companyName" | "price" | "changePercent" | "composite" | "signal" | "confidence"
> & {
  categories: Array<Pick<CategoryScore, "name" | "label" | "score">>;
};

const SIGNAL_LABEL: Record<Signal, { label: string; arrow: string; color: "green" | "amber" | "red" }> = {
  BUY_LONG_TERM: { label: "Buy Long-Term", arrow: "▲", color: "green" },
  BUY_SHORT_TERM: { label: "Buy Short-Term", arrow: "▲", color: "green" },
  HOLD: { label: "Hold", arrow: "▬", color: "amber" },
  SHORT: { label: "Short", arrow: "▼", color: "red" },
};

const FACTOR_COLOR = (score: number): "green" | "amber" | "red" => {
  if (score >= 65) return "green";
  if (score >= 40) return "amber";
  return "red";
};

const SIGNAL_VAR = (color: "green" | "amber" | "red"): string =>
  color === "green" ? "var(--accent)" : color === "amber" ? "var(--amber)" : "var(--red)";

export default function DemoCardView({ data }: { data: DemoData }) {
  const signal = SIGNAL_LABEL[data.signal];
  const changeUp = data.changePercent >= 0;
  // SVG ring circumference for r=45 ≈ 282.7
  const circumference = 283;
  const targetOffset = circumference - (data.composite / 100) * circumference;

  return (
    <div className="demo-card">
      <div className="demo-header">
        <div className="demo-ticker">
          {data.ticker} <span className="company">{data.companyName}</span>
        </div>
        <div className="demo-price">
          ${data.price.toFixed(2)}{" "}
          <span className="change" style={{ color: changeUp ? undefined : "var(--red)" }}>
            {changeUp ? "+" : ""}
            {data.changePercent.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="score-ring">
        <div
          className="ring-container"
          style={{ ["--target-offset" as string]: targetOffset } as React.CSSProperties}
        >
          <svg viewBox="0 0 100 100" width="100" height="100">
            <circle className="ring-bg" cx="50" cy="50" r="45" />
            <circle className="ring-fill" cx="50" cy="50" r="45" />
          </svg>
          <div className="ring-number">{data.composite}</div>
        </div>
        <div className="score-meta">
          <h3>QScore Signal</h3>
          <div className="signal" style={{ color: SIGNAL_VAR(signal.color) }}>
            {signal.arrow} {signal.label}
          </div>
          <div className="confidence">
            Confidence: {data.confidence.charAt(0) + data.confidence.slice(1).toLowerCase()}
          </div>
        </div>
      </div>

      <div className="factor-bars">
        {data.categories.map((c, i) => {
          const score = Math.round(c.score);
          return (
            <div key={c.name} className="factor">
              <span className="factor-label">{c.label}</span>
              <div className="factor-track">
                <div
                  className={`factor-fill ${FACTOR_COLOR(c.score)}`}
                  style={
                    {
                      ["--w" as string]: `${score}%`,
                      ["--delay" as string]: `${0.5 + i * 0.1}s`,
                    } as React.CSSProperties
                  }
                />
              </div>
              <span className="factor-val">{score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
