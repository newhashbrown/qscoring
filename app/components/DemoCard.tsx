import { computeStrongPicks } from "@/lib/scoring/picks";
import { scoreTicker } from "@/lib/scoring";
import DemoCarousel from "./DemoCarousel";
import type { DemoData } from "./DemoCardView";

const FALLBACK_TICKER = "NVDA";

// Static fallback shown if FMP is unreachable on first server render so the
// landing page never breaks. Once the client hydrates and a later server
// render succeeds, the carousel populates with real strong picks.
const STATIC_FALLBACK: DemoData = {
  ticker: FALLBACK_TICKER,
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

async function loadPicks(): Promise<DemoData[]> {
  try {
    const picks = await computeStrongPicks(12);
    if (picks.length > 0) {
      return picks.map((p) => ({
        ticker: p.ticker,
        companyName: p.companyName,
        price: p.price,
        changePercent: p.changePercent,
        composite: p.composite,
        signal: p.signal,
        confidence: p.confidence,
        categories: p.categories,
      }));
    }
  } catch {
    // Fall through to single-ticker fallback below.
  }

  // Last-resort fallback: try to score one well-covered ticker so the demo
  // shows something real rather than the static placeholder.
  try {
    const r = await scoreTicker(FALLBACK_TICKER);
    return [
      {
        ticker: r.ticker,
        companyName: r.companyName,
        price: r.price,
        changePercent: r.changePercent,
        composite: r.composite,
        signal: r.signal,
        confidence: r.confidence,
        categories: r.categories.map((c) => ({ name: c.name, label: c.label, score: c.score })),
      },
    ];
  } catch {
    return [STATIC_FALLBACK];
  }
}

export default async function DemoCard() {
  const picks = await loadPicks();
  return <DemoCarousel picks={picks} />;
}
