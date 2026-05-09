import { ImageResponse } from "next/og";
import { scoreTicker } from "@/lib/scoring";

export const alt = "QScore breakdown card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SIGNAL_LABEL: Record<string, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

const SIGNAL_COLOR: Record<string, string> = {
  BUY_LONG_TERM: "#00D4AA",
  BUY_SHORT_TERM: "#00D4AA",
  HOLD: "#FFB800",
  SHORT: "#FF4757",
};

const FACTOR_ORDER = ["value", "growth", "momentum", "profitability", "risk"] as const;
const FACTOR_LABEL: Record<string, string> = {
  value: "Value",
  growth: "Growth",
  momentum: "Momentum",
  profitability: "Profitability",
  risk: "Risk",
};

function factorTone(score: number): string {
  if (score >= 65) return "#00D4AA";
  if (score >= 40) return "#FFB800";
  return "#FF4757";
}

export default async function Image({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const decoded = decodeURIComponent(ticker).trim().toUpperCase();

  // Try to render the real score. If anything fails (FMP down, ticker
  // invalid), render a generic branded card so social previews still work.
  let composite: number | null = null;
  let signal = "HOLD";
  let companyName = decoded;
  let factors: Array<{ name: string; score: number }> = [];

  try {
    const r = await scoreTicker(decoded);
    composite = Math.round(r.composite);
    signal = r.signal;
    companyName = r.companyName;
    factors = r.categories.map((c) => ({
      name: c.name,
      score: Math.round(c.score),
    }));
  } catch {
    // Fall through to generic card below.
  }

  const signalLabel = SIGNAL_LABEL[signal] ?? "Hold";
  const signalColor = SIGNAL_COLOR[signal] ?? "#FFB800";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0A0E17 0%, #111827 100%)",
          color: "#E8ECF1",
          fontFamily: "Helvetica, Arial, sans-serif",
          padding: "64px 80px",
          position: "relative",
        }}
      >
        {/* Brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 48,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-1px",
            }}
          >
            <span style={{ color: "#E8ECF1" }}>QScoring</span>
            <span style={{ color: "#00D4AA", marginLeft: 4 }}>.com</span>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "monospace",
              fontSize: 18,
              color: "#7B8794",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            Quant Score
          </div>
        </div>

        {/* Main row: ticker on left, composite on right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
            <div
              style={{
                fontSize: 140,
                fontWeight: 800,
                letterSpacing: "-4px",
                lineHeight: 1,
                color: "#E8ECF1",
              }}
            >
              {decoded}
            </div>
            <div
              style={{
                fontSize: 32,
                color: "#B7C0CC",
                marginTop: 12,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 700,
              }}
            >
              {companyName}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 28,
                padding: "12px 24px",
                background: `${signalColor}1f`,
                border: `2px solid ${signalColor}`,
                borderRadius: 10,
                color: signalColor,
                fontSize: 28,
                fontWeight: 600,
                alignSelf: "flex-start",
              }}
            >
              {signalLabel}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "monospace",
                fontSize: 22,
                color: "#7B8794",
                letterSpacing: "2px",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Composite
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                color: signalColor,
              }}
            >
              <span style={{ fontSize: 220, fontWeight: 800, letterSpacing: "-6px", lineHeight: 1 }}>
                {composite ?? "—"}
              </span>
              <span style={{ fontSize: 56, color: "#7B8794", marginLeft: 8 }}>/100</span>
            </div>
          </div>
        </div>

        {/* Factor row at bottom */}
        {factors.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              marginTop: 40,
              paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {FACTOR_ORDER.map((name) => {
              const f = factors.find((x) => x.name === name);
              const score = f?.score ?? 0;
              return (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 16,
                      color: "#7B8794",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    {FACTOR_LABEL[name]}
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 44,
                      fontWeight: 700,
                      color: factorTone(score),
                    }}
                  >
                    {score}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    { ...size }
  );
}
