"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Conceptual illustration for /how-it-works: how a single stock's raw metric
 * becomes a *rank* once it's normalized cross-sectionally against the whole
 * universe. A field of bars traces the universe distribution; the highlighted
 * bar + marker resolve to the stock's percentile.
 *
 * Deliberately reveals nothing proprietary — no weights, no specific metric,
 * no combination function. It only shows the idea of cross-sectional ranking.
 *
 * Progressive enhancement: with JS, the bars/marker stay hidden until scrolled
 * into view, then animate in once (transform/opacity only). Without JS — or
 * with prefers-reduced-motion — the final, meaningful state renders statically.
 */

const BAR_COUNT = 33;
const TARGET_PERCENTILE = 73; // where the highlighted stock lands
const HIGHLIGHT_INDEX = Math.round((TARGET_PERCENTILE / 100) * (BAR_COUNT - 1));

// Gaussian-ish heights so the field reads as a distribution, not a random bar
// chart. Pure presentation — these are not real data.
const BAR_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const x = (i - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 5.5);
  const h = Math.exp(-(x * x) / 2); // 0..1
  return Math.round((0.18 + 0.82 * h) * 100); // 18%..100%
});

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export default function CrossSectionalRank() {
  const ref = useRef<HTMLDivElement>(null);
  // `armed` = JS is running, so it's safe to hide-then-animate. Stays false
  // for no-JS users so the final state is never hidden from them.
  const [armed, setArmed] = useState(false);
  const [inView, setInView] = useState(false);
  const [pct, setPct] = useState(TARGET_PERCENTILE);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      // No motion: render the resolved state immediately, don't arm/observe.
      setInView(true);
      setPct(TARGET_PERCENTILE);
      return;
    }

    setArmed(true);
    setPct(50); // start at the median; resolve to the real rank on reveal

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Tie the percentile readout to the marker's travel: count 50 → target while
  // the marker slides, so the number resolving *is* the ranking happening.
  useEffect(() => {
    if (!inView || !armed) return;
    const from = 50;
    const to = TARGET_PERCENTILE;
    const duration = 750;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic, matches the bars
      setPct(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, armed]);

  const stateClass = `${armed ? "hiw-rank--armed" : ""} ${inView ? "hiw-rank--in" : ""}`;

  return (
    <figure className="hiw-rank" aria-labelledby="hiw-rank-cap">
      <div
        ref={ref}
        className={`hiw-rank-stage ${stateClass}`}
        role="img"
        aria-label={`Cross-sectional ranking: one stock's normalized metric places it in the ${TARGET_PERCENTILE}rd percentile of the universe.`}
      >
        <div className="hiw-rank-bars" aria-hidden="true">
          {BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className={`hiw-rank-bar ${i === HIGHLIGHT_INDEX ? "is-stock" : ""}`}
              style={
                {
                  "--h": `${h}%`,
                  "--i": i,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        <div
          className="hiw-rank-marker"
          aria-hidden="true"
          style={{ "--target": `${TARGET_PERCENTILE}%` } as React.CSSProperties}
        >
          <span className="hiw-rank-marker-line" />
          <span className="hiw-rank-readout">
            <span className="hiw-rank-pct num">{pct}</span>
            <span className="hiw-rank-pct-suffix">percentile</span>
          </span>
        </div>

        <div className="hiw-rank-axis" aria-hidden="true">
          <span>Weakest in universe</span>
          <span>Strongest</span>
        </div>
      </div>
      <figcaption id="hiw-rank-cap" className="hiw-rank-caption">
        Every raw metric is ranked against every other stock in the universe, so
        a score reflects a company&apos;s <strong>position relative to its peers</strong>
        {" "}&mdash; not an absolute number that means different things in different
        sectors.
      </figcaption>
    </figure>
  );
}
