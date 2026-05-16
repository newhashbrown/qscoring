import ScoreNav from "@/app/components/ScoreNav";

function Skel({ w, h = 14, r = 4 }: { w: string; h?: number; r?: number }) {
  return <div className="skel-line" style={{ width: w, height: h, borderRadius: r }} />;
}

function SkeletonMetricRow() {
  return (
    <div className="metric-row">
      <Skel w="90px" />
      <Skel w="50px" />
      <div className="metric-track">
        <div className="skel-line" style={{ width: "60%", height: "100%", borderRadius: 2 }} />
      </div>
      <Skel w="24px" />
    </div>
  );
}

function SkeletonCategoryCard() {
  return (
    <div className="category-card">
      <div className="category-header">
        <Skel w="80px" h={16} />
        <Skel w="28px" h={22} r={6} />
      </div>
      <div className="metric-list">
        <SkeletonMetricRow />
        <SkeletonMetricRow />
        <SkeletonMetricRow />
        <SkeletonMetricRow />
      </div>
    </div>
  );
}

export default function ScoreLoading() {
  return (
    <>
      <div className="glow-orb green" />
      <div className="glow-orb blue" />
      <ScoreNav />
      <main>
        <div className="score-page">
          <header className="score-header">
            <div className="score-id">
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 12 }}>
                <Skel w="72px" h={28} r={6} />
                <Skel w="150px" h={16} />
              </div>
              <div className="score-meta-row">
                <Skel w="80px" h={22} r={12} />
                <Skel w="110px" h={22} r={12} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <Skel w="88px" h={26} r={6} />
              <Skel w="56px" />
            </div>
          </header>

          <section className="composite-panel" style={{ borderColor: "var(--border)" }}>
            <div className="skel-ring" />
            <div className="composite-meta">
              <Skel w="90px" h={13} />
              <div style={{ margin: "10px 0" }}>
                <Skel w="130px" h={26} r={6} />
              </div>
              <Skel w="110px" h={13} />
              <div className="composite-horizons" style={{ marginTop: 16 }}>
                <div>
                  <Skel w="58px" h={11} />
                  <div style={{ marginTop: 6 }}><Skel w="36px" h={22} r={4} /></div>
                </div>
                <div>
                  <Skel w="68px" h={11} />
                  <div style={{ marginTop: 6 }}><Skel w="36px" h={22} r={4} /></div>
                </div>
              </div>
            </div>
          </section>

          <section className="score-insight" aria-hidden="true">
            <div className="insight-head">
              <Skel w="100px" h={13} />
              <Skel w="180px" h={11} />
            </div>
            <div className="insight-grid" style={{ marginTop: 16, marginBottom: 12 }}>
              <Skel w="100%" h={64} r={8} />
              <Skel w="100%" h={64} r={8} />
            </div>
            <Skel w="88%" h={13} />
            <div style={{ marginTop: 8 }}>
              <Skel w="65%" h={13} />
            </div>
          </section>

          <div className="chart-skeleton" style={{ marginBottom: 28 }} />

          <section className="category-grid">
            <SkeletonCategoryCard />
            <SkeletonCategoryCard />
            <SkeletonCategoryCard />
            <SkeletonCategoryCard />
            <SkeletonCategoryCard />
          </section>
        </div>
      </main>

      <footer>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
