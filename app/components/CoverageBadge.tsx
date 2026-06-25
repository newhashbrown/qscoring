import type { CSSProperties } from "react";
import type { Coverage, CoverageState } from "@/lib/coverage";

/**
 * Coverage badge shown above the score on every /score page. Makes the
 * reference-universe limitation visible at the point of use — so a generic
 * factor score on an ETF, a bank, a micro-cap, or a freshly-listed name reads
 * as "outside what this model is built for," not as a confident verdict.
 *
 * Styling is inline (scoped to this one component) so nothing is added to the
 * global CSS cold path that the Cloudflare startup budget cares about.
 */
const TONE: Record<CoverageState, string> = {
  in_universe: "#16a34a", // green
  approximation: "#d97706", // amber
  insufficient_data: "#d97706", // amber
  do_not_score: "#dc2626", // red
};

export default function CoverageBadge({ coverage }: { coverage?: Coverage }) {
  if (!coverage) return null;
  const accent = TONE[coverage.state];

  const wrap: CSSProperties = {
    display: "flex",
    gap: "10px",
    alignItems: "baseline",
    flexWrap: "wrap",
    margin: "0 0 20px",
    padding: "10px 14px",
    borderRadius: "10px",
    border: `1px solid ${accent}33`,
    borderLeft: `3px solid ${accent}`,
    background: `${accent}14`,
    fontSize: "0.9rem",
    lineHeight: 1.5,
  };
  const labelStyle: CSSProperties = { color: accent, fontWeight: 700, whiteSpace: "nowrap" };
  const reasonStyle: CSSProperties = { color: "var(--text-muted)" };

  return (
    <aside style={wrap} role="note" aria-label={`Coverage: ${coverage.label}`}>
      <span style={labelStyle}>{coverage.label}</span>
      <span style={reasonStyle}>{coverage.reason}</span>
    </aside>
  );
}
