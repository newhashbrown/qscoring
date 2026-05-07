import { NextResponse } from "next/server";
import { generateCommentary } from "@/lib/commentary/generate";
import type { ScoreResult } from "@/lib/scoring";

export const dynamic = "force-dynamic";

// Mock score used only to verify the AI binding works while FMP is rate-limited.
// TODO: Remove this route once commentary is verified end-to-end through real scores.
const MOCK_SCORE: ScoreResult = {
  ticker: "AAPL",
  companyName: "Apple Inc.",
  sector: "Technology",
  industry: "Consumer Electronics",
  price: 287.51,
  changePercent: 1.17,
  composite: 66,
  signal: "BUY_SHORT_TERM",
  confidence: "MEDIUM",
  longTermScore: 61,
  shortTermScore: 72,
  generatedAt: new Date().toISOString(),
  categories: [
    {
      name: "value",
      label: "Value",
      score: 23,
      weightLong: 0.3,
      weightShort: 0.1,
      completeness: 1,
      metrics: [
        { name: "P/E", raw: 34.5, score: 30, weight: 1.2 },
        { name: "P/B", raw: 39.7, score: 0, weight: 1 },
        { name: "P/S", raw: 9.3, score: 33, weight: 1 },
        { name: "EV/EBITDA", raw: 26.6, score: 28, weight: 1.2 },
      ],
    },
    {
      name: "growth",
      label: "Growth",
      score: 55,
      weightLong: 0.2,
      weightShort: 0.15,
      completeness: 1,
      metrics: [
        { name: "Revenue Growth", raw: 0.064, score: 56, weight: 1.5 },
        { name: "EPS Growth", raw: 0.226, score: 77, weight: 1.5 },
        { name: "FCF Growth", raw: -0.092, score: 22, weight: 1 },
      ],
    },
    {
      name: "momentum",
      label: "Momentum",
      score: 80,
      weightLong: 0.05,
      weightShort: 0.4,
      completeness: 1,
      metrics: [
        { name: "12-Month Return", raw: 0.446, score: 91, weight: 1.5 },
        { name: "3-Month Return", raw: 0.04, score: 58, weight: 1.2 },
        { name: "1-Month Return", raw: 0.134, score: 86, weight: 1 },
        { name: "RSI (14)", raw: 71.1, score: 86, weight: 1 },
        { name: "50/200 MA", raw: 1, score: 78, weight: 1 },
      ],
    },
    {
      name: "profitability",
      label: "Profitability",
      score: 88,
      weightLong: 0.25,
      weightShort: 0.1,
      completeness: 1,
      metrics: [
        { name: "ROE", raw: 1.467, score: 100, weight: 1.5 },
        { name: "ROA", raw: 0.33, score: 100, weight: 1 },
        { name: "Gross Margin", raw: 0.479, score: 99, weight: 1 },
        { name: "Operating Margin", raw: 0.326, score: 91, weight: 1.2 },
        { name: "Net Margin", raw: 0.272, score: 85, weight: 1 },
        { name: "FCF Yield", raw: 0.031, score: 55, weight: 1.2 },
      ],
    },
    {
      name: "risk",
      label: "Risk",
      score: 83,
      weightLong: 0.2,
      weightShort: 0.25,
      completeness: 1,
      metrics: [
        { name: "Beta", raw: 1.109, score: 95, weight: 1 },
        { name: "60-Day Volatility", raw: 0.26, score: 73, weight: 1.2 },
      ],
    },
  ],
};

export async function GET() {
  const startedAt = Date.now();
  const text = await generateCommentary(MOCK_SCORE);
  return NextResponse.json({
    ok: text !== null,
    elapsedMs: Date.now() - startedAt,
    commentary: text,
  });
}
