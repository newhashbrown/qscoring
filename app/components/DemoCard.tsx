import strongPicksData from "@/data/strong-picks.json";
import DemoCarousel from "./DemoCarousel";
import type { DemoData } from "./DemoCardView";

// Static fallback shown if the prebuilt picks file is empty or missing.
// Mirrors the shape of a real pick so the carousel renders normally.
const STATIC_FALLBACK: DemoData = {
  ticker: "NVDA",
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

export default function DemoCard() {
  // Read the prebuilt JSON synchronously at module load. The file is updated
  // out-of-band by scripts/build-strong-picks.ts (run daily by a GitHub
  // Action), so SSR never has to call FMP or do any scoring work.
  const picks: DemoData[] =
    strongPicksData.picks.length > 0
      ? (strongPicksData.picks as DemoData[])
      : [STATIC_FALLBACK];

  return (
    <DemoCarousel
      picks={picks}
      generatedAt={strongPicksData.picks.length > 0 ? strongPicksData.generatedAt : null}
    />
  );
}
