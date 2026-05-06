import { scoreTicker, type ScoreResult, type Signal } from "@/lib/scoring";

const DEMO_TICKER = "NVDA";

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

// Fallback shown if FMP is unreachable so the landing page never breaks.
const FALLBACK: Pick<
  ScoreResult,
  "ticker" | "companyName" | "price" | "changePercent" | "composite" | "signal" | "confidence" | "categories"
> = {
  ticker: DEMO_TICKER,
  companyName: "NVIDIA Corporation",
  price: 135.4,
  changePercent: 2.3,
  composite: 79,
  signal: "BUY_LONG_TERM",
  confidence: "HIGH",
  categories: [
    { name: "value", label: "Value", score: 62, weightLong: 0.3, weightShort: 0.1, metrics: [], completeness: 1 },
    { name: "growth", label: "Growth", score: 91, weightLong: 0.2, weightShort: 0.15, metrics: [], completeness: 1 },
    { name: "momentum", label: "Momentum", score: 84, weightLong: 0.05, weightShort: 0.4, metrics: [], completeness: 1 },
    { name: "profitability", label: "Profitability", score: 88, weightLong: 0.25, weightShort: 0.1, metrics: [], completeness: 1 },
    { name: "risk", label: "Risk", score: 55, weightLong: 0.2, weightShort: 0.25, metrics: [], completeness: 1 },
  ],
};

export default async function DemoCard() {
  let data: typeof FALLBACK;
  try {
    data = await scoreTicker(DEMO_TICKER);
  } catch {
    data = FALLBACK;
  }

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
          <div className="signal" style={{ color: `var(--${signal.color === "green" ? "accent" : signal.color === "amber" ? "amber" : "red"})` }}>
            {signal.arrow} {signal.label}
          </div>
          <div className="confidence">Confidence: {data.confidence.charAt(0) + data.confidence.slice(1).toLowerCase()}</div>
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
                      ["--delay" as string]: `${0.9 + i * 0.1}s`,
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
