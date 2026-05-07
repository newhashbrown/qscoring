import type { ScoreResult } from "@/lib/scoring";

const SIGNAL_PROSE: Record<ScoreResult["signal"], string> = {
  BUY_LONG_TERM: "Buy (Long-Term)",
  BUY_SHORT_TERM: "Buy (Short-Term)",
  HOLD: "Hold",
  SHORT: "Short",
};

function fmtPct(v: number | null): string {
  if (v === null) return "n/a";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtRatio(v: number | null): string {
  if (v === null) return "n/a";
  return v.toFixed(1);
}

export const SYSTEM_PROMPT = [
  "You are a quantitative equity analyst writing brief commentary on a stock's QScore.",
  "Audience: a self-directed retail investor who wants to understand WHY the score is what it is.",
  "",
  "Output rules:",
  "- 2-4 sentences, 60-100 words total",
  "- One paragraph, no markdown, no bullet points, no headers",
  "- Lead with what the score is telling us, then explain which factor categories drive it up vs down",
  "- If long-term and short-term scores diverge meaningfully (>10 points apart), note the divergence",
  "- Reference specific raw numbers when they're striking (e.g., \"P/E of 35x\", \"ROE near 50%\", \"+45% over the past year\")",
  '- Use neutral, factual language: "scores high on", "trades at a premium", "exhibits strong momentum"',
  '- NEVER use advisory phrases like "you should buy", "we recommend", or "this is a great stock"',
  "- Never make predictions about future returns or price targets",
].join("\n");

export function buildUserPrompt(s: ScoreResult): string {
  const get = (cat: string, metric: string): number | null => {
    const c = s.categories.find((x) => x.name === cat);
    const m = c?.metrics.find((x) => x.name === metric);
    return m?.raw ?? null;
  };

  const value = s.categories.find((c) => c.name === "value")!;
  const growth = s.categories.find((c) => c.name === "growth")!;
  const momentum = s.categories.find((c) => c.name === "momentum")!;
  const profitability = s.categories.find((c) => c.name === "profitability")!;
  const risk = s.categories.find((c) => c.name === "risk")!;

  return [
    `${s.ticker} (${s.companyName}) — ${s.sector ?? "Unknown sector"}`,
    `Composite QScore: ${s.composite}/100`,
    `Signal: ${SIGNAL_PROSE[s.signal]}`,
    `Confidence: ${s.confidence}`,
    `Long-term score: ${s.longTermScore}/100 · Short-term score: ${s.shortTermScore}/100`,
    "",
    "Category scores (0-100, higher is better):",
    `- Value: ${Math.round(value.score)} — P/E ${fmtRatio(get("value", "P/E"))}, P/B ${fmtRatio(get("value", "P/B"))}, P/S ${fmtRatio(get("value", "P/S"))}, EV/EBITDA ${fmtRatio(get("value", "EV/EBITDA"))}`,
    `- Growth: ${Math.round(growth.score)} — Revenue growth ${fmtPct(get("growth", "Revenue Growth"))}, EPS growth ${fmtPct(get("growth", "EPS Growth"))}, FCF growth ${fmtPct(get("growth", "FCF Growth"))}`,
    `- Momentum: ${Math.round(momentum.score)} — 12-month return ${fmtPct(get("momentum", "12-Month Return"))}, 3-month ${fmtPct(get("momentum", "3-Month Return"))}, RSI ${fmtRatio(get("momentum", "RSI (14)"))}, 50d-vs-200d MA ${get("momentum", "50/200 MA") === 1 ? "bullish" : get("momentum", "50/200 MA") === 0 ? "bearish" : "n/a"}`,
    `- Profitability: ${Math.round(profitability.score)} — ROE ${fmtPct(get("profitability", "ROE"))}, ROA ${fmtPct(get("profitability", "ROA"))}, gross margin ${fmtPct(get("profitability", "Gross Margin"))}, operating margin ${fmtPct(get("profitability", "Operating Margin"))}, FCF yield ${fmtPct(get("profitability", "FCF Yield"))}`,
    `- Risk: ${Math.round(risk.score)} — Beta ${fmtRatio(get("risk", "Beta"))}, 60-day volatility ${fmtPct(get("risk", "60-Day Volatility"))}`,
    "",
    "Write the commentary paragraph now.",
  ].join("\n");
}
