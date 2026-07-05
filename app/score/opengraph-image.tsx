import { ImageResponse } from "next/og";

// Static branded OG card for /score and every /score/[ticker] page (metadata
// file conventions cascade to child segments that don't define their own).
//
// WHY STATIC: the previous per-ticker card lived at
// app/score/[ticker]/opengraph-image.tsx and ran ImageResponse at REQUEST
// time inside the Cloudflare Worker — where satori/resvg isn't available
// under OpenNext, so every og:image URL returned a platform-layer 500
// (verified live 2026-07-04: `/score/AAPL/opengraph-image` → 500 text/plain).
// This segment-level card has NO dynamic params, so `next build` prerenders
// it once in Node (where ImageResponse works) and it ships as a cached
// static asset — zero request-path compute. Per-ticker dynamic OG cards can
// return if/when OpenNext supports request-time ImageResponse; until then a
// working branded card beats a broken personalized one.
//
// Design: Direction-B brand language — dark navy surface, signal palette for
// the factor accents, the same layout grammar as the score page itself.

export const alt = "QScoring — quantitative stock scores with factor breakdowns";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FACTORS = [
  { label: "Value", tone: "#FFB800" },
  { label: "Growth", tone: "#00D4AA" },
  { label: "Momentum", tone: "#00D4AA" },
  { label: "Profitability", tone: "#00D4AA" },
  { label: "Risk", tone: "#FFB800" },
];

export default function Image() {
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
        }}
      >
        {/* Brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 56,
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

        {/* Main row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 660 }}>
            <div
              style={{
                fontSize: 76,
                fontWeight: 800,
                letterSpacing: "-2px",
                lineHeight: 1.05,
                color: "#E8ECF1",
              }}
            >
              One score.
            </div>
            <div
              style={{
                fontSize: 76,
                fontWeight: 800,
                letterSpacing: "-2px",
                lineHeight: 1.05,
                color: "#00D4AA",
              }}
            >
              Five factors.
            </div>
            <div style={{ fontSize: 28, color: "#B7C0CC", marginTop: 24, lineHeight: 1.4 }}>
              Quantitative stock scores with a full factor breakdown,
              rebuilt after every NYSE session.
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
              QScore
            </div>
            <div style={{ display: "flex", alignItems: "baseline", color: "#00D4AA" }}>
              <span
                style={{ fontSize: 190, fontWeight: 800, letterSpacing: "-6px", lineHeight: 1 }}
              >
                87
              </span>
              <span style={{ fontSize: 52, color: "#7B8794", marginLeft: 8 }}>/100</span>
            </div>
          </div>
        </div>

        {/* Factor row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginTop: 44,
            paddingTop: 28,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {FACTORS.map((f) => (
            <div
              key={f.label}
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
                  marginBottom: 10,
                }}
              >
                {f.label}
              </div>
              <div
                style={{
                  display: "flex",
                  width: 120,
                  height: 8,
                  borderRadius: 4,
                  background: `${f.tone}55`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 84,
                    height: 8,
                    borderRadius: 4,
                    background: f.tone,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
