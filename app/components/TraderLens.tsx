import type { TraderLens as TraderLensData, TraderSetup } from "@/lib/scoring/types";

// Tier-3 "Trader's Lens": technical-setup context for the active/swing trader,
// read straight off ScoreResult.lens (computed live in scoreFromFetched — no
// fetch here). Presentation only; not part of the QScore. Every field is
// nullable and renders "—" when absent.

type Tone = "bull" | "bear" | "neutral";

const SETUP_META: Record<TraderSetup, { label: string; tone: Tone }> = {
  above_50dma: { label: "Above 50-DMA", tone: "bull" },
  below_50dma: { label: "Below 50-DMA", tone: "bear" },
  above_200dma: { label: "Above 200-DMA", tone: "bull" },
  below_200dma: { label: "Below 200-DMA", tone: "bear" },
  uptrend: { label: "Uptrend", tone: "bull" },
  downtrend: { label: "Downtrend", tone: "bear" },
  near_52w_high: { label: "Near 52W high", tone: "bull" },
  near_52w_low: { label: "Near 52W low", tone: "bear" },
  rising_volume: { label: "Rising volume", tone: "neutral" },
  strong_momentum: { label: "Strong momentum", tone: "bull" },
};

function signedPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)}%`;
}

function ratio(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}×`;
}

// Tone only where the sign maps cleanly to bullish/bearish. Distance from the
// 52-week high/low and the volume ratio are left neutral (a stock below its
// 52w high isn't inherently "bearish").
function signTone(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "tone-bullish" : "tone-bearish";
}

function Metric({
  label,
  value,
  toneClass = "",
}: {
  label: string;
  value: string;
  toneClass?: string;
}) {
  return (
    <div className="tl-metric">
      <span className="tl-label">{label}</span>
      <span className={`tl-value ${toneClass}`}>{value}</span>
    </div>
  );
}

export default function TraderLens({ lens }: { lens?: TraderLensData }) {
  if (!lens) return null; // snapshot-reconstructed / legacy results carry no lens

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Tier 3</span>
        <span className="signal-title">Trader&apos;s Lens</span>
      </summary>
      <div className="signal-body">
        {lens.setups.length > 0 && (
          <div className="as-block">
            <div className="as-row">
              <span className="as-label">Technical setups</span>
            </div>
            <div className="tl-setups">
              {lens.setups.map((s) => (
                <span key={s} className={`tl-chip ${SETUP_META[s].tone}`}>
                  {SETUP_META[s].label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="as-block">
          <div className="tl-metrics">
            <Metric label="vs 50-DMA" value={signedPct(lens.pctFrom50dma)} toneClass={signTone(lens.pctFrom50dma)} />
            <Metric label="vs 200-DMA" value={signedPct(lens.pctFrom200dma)} toneClass={signTone(lens.pctFrom200dma)} />
            <Metric label="20-day return" value={signedPct(lens.return20d)} toneClass={signTone(lens.return20d)} />
            <Metric label="vs 52W high" value={signedPct(lens.pctFrom52wHigh)} />
            <Metric label="vs 52W low" value={signedPct(lens.pctFrom52wLow)} />
            <Metric label="Volume 5d/20d" value={ratio(lens.volumeTrend)} />
          </div>
        </div>

        <p className="as-detail">
          Technical context for active traders — derived from price, the 50/200-day
          moving averages, the 52-week range, and recent volume. Not part of the QScore.
        </p>
      </div>
    </details>
  );
}
