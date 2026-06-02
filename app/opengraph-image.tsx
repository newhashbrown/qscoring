import { ImageResponse } from "next/og";

// Default Open Graph / Twitter card for the homepage (and any route without
// its own opengraph-image). Score pages override this via
// app/score/[ticker]/opengraph-image.tsx. Same next/og pattern, on-brand
// navy + gold "Direction B" palette.
export const alt =
  "QScoring — quantitative stock scoring with buy, hold, or short signals";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0A0E17",
          backgroundImage:
            "radial-gradient(60% 60% at 85% 15%, rgba(245,158,11,0.18), transparent 70%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#FBBF24",
            fontWeight: 700,
            marginBottom: 28,
          }}
        >
          QScoring
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 78,
            lineHeight: 1.05,
            fontWeight: 800,
            color: "#F8FAFC",
            letterSpacing: -2,
            maxWidth: 940,
          }}
        >
          Quantitative stock scoring, one clear signal.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#CBD5E1",
            marginTop: 32,
            maxWidth: 920,
          }}
        >
          Value · Growth · Momentum · Profitability · Risk → one QScore, with a
          buy, hold, or short signal.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 26,
            color: "#778999",
          }}
        >
          qscoring.com
        </div>
      </div>
    ),
    { ...size },
  );
}
