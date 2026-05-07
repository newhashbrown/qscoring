import { scoreTicker } from "@/lib/scoring";
import DemoCarousel from "./DemoCarousel";
import type { DemoData } from "./DemoCardView";

const INITIAL_TICKER = "NVDA";

// Fallback shown if FMP is unreachable on first server render so the landing
// page never breaks. Once the client hydrates, the carousel will try to fetch
// real data via /api/score and replace this card on the next cycle.
const FALLBACK: DemoData = {
  ticker: INITIAL_TICKER,
  companyName: "NVIDIA Corporation",
  price: 135.4,
  changePercent: 2.3,
  composite: 79,
  signal: "BUY_LONG_TERM",
  confidence: "HIGH",
  categories: [
    { name: "value", label: "Value", score: 62 },
    { name: "growth", label: "Growth", score: 91 },
    { name: "momentum", label: "Momentum", score: 84 },
    { name: "profitability", label: "Profitability", score: 88 },
    { name: "risk", label: "Risk", score: 55 },
  ],
};

export default async function DemoCard() {
  let initial: DemoData;
  try {
    const result = await scoreTicker(INITIAL_TICKER);
    initial = {
      ticker: result.ticker,
      companyName: result.companyName,
      price: result.price,
      changePercent: result.changePercent,
      composite: result.composite,
      signal: result.signal,
      confidence: result.confidence,
      categories: result.categories.map((c) => ({ name: c.name, label: c.label, score: c.score })),
    };
  } catch {
    initial = FALLBACK;
  }

  return <DemoCarousel initial={initial} />;
}
