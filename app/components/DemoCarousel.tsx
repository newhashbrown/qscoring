"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DemoCardView, { type DemoData } from "./DemoCardView";

const CYCLE_MS = 4500;

export default function DemoCarousel({ picks }: { picks: DemoData[] }) {
  // Single-pick or empty list: render a static card without any cycling
  // chrome. The fallback path in DemoCard guarantees at least one entry.
  const safePicks = picks.length > 0 ? picks : [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Cycle every CYCLE_MS while not paused. Skipped when there's only one
  // pick so we don't burn a timer for nothing.
  useEffect(() => {
    if (paused || safePicks.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % safePicks.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [paused, safePicks.length]);

  // If picks shrinks (rare — only on a re-render with fewer items), keep the
  // index in range.
  useEffect(() => {
    if (index >= safePicks.length && safePicks.length > 0) {
      setIndex(0);
    }
  }, [safePicks.length, index]);

  if (safePicks.length === 0) return null;
  const current = safePicks[Math.min(index, safePicks.length - 1)];

  return (
    <div
      className="demo-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Re-mounting on key change replays the entry animations (ring fill, factor bars). */}
      <Link href={`/score/${current.ticker}`} className="demo-link" key={current.ticker}>
        <DemoCardView data={current} />
      </Link>

      {safePicks.length > 1 && (
        <div className="demo-dots" role="tablist" aria-label="Strong picks carousel">
          {safePicks.map((p, i) => (
            <button
              key={p.ticker}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show ${p.ticker}`}
              className={`demo-dot ${i === index ? "active" : ""}`}
              onClick={() => setIndex(i)}
            >
              {p.ticker}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
