"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import DemoCardView, { type DemoData } from "./DemoCardView";

const ROTATION = ["NVDA", "AAPL", "MSFT", "GOOGL", "META", "TSLA", "AMZN"] as const;
const CYCLE_MS = 7000;

type ScoreApiResponse = DemoData & { error?: string };

function toDemoData(d: ScoreApiResponse): DemoData {
  return {
    ticker: d.ticker,
    companyName: d.companyName,
    price: d.price,
    changePercent: d.changePercent,
    composite: d.composite,
    signal: d.signal,
    confidence: d.confidence,
    categories: d.categories.map((c) => ({ name: c.name, label: c.label, score: c.score })),
  };
}

export default function DemoCarousel({ initial }: { initial: DemoData }) {
  // Start at the index whose ticker matches the SSR'd initial card so we don't
  // flash a different ticker on hydration.
  const startIndex = Math.max(
    0,
    ROTATION.findIndex((t) => t === initial.ticker)
  );
  const [index, setIndex] = useState(startIndex);
  const [cache] = useState(() => new Map<string, DemoData>([[initial.ticker, initial]]));
  const [current, setCurrent] = useState<DemoData>(initial);
  const [paused, setPaused] = useState(false);
  const inflight = useRef(new Set<string>());

  // Fetch a ticker if not cached. Tolerates failures silently — the carousel
  // simply skips ahead next tick if a ticker can't be loaded.
  async function ensureTicker(ticker: string): Promise<DemoData | null> {
    if (cache.has(ticker)) return cache.get(ticker)!;
    if (inflight.current.has(ticker)) return null;
    inflight.current.add(ticker);
    try {
      const res = await fetch(`/api/score/${encodeURIComponent(ticker)}`);
      if (!res.ok) return null;
      const json = (await res.json()) as ScoreApiResponse;
      if (json.error) return null;
      const data = toDemoData(json);
      cache.set(ticker, data);
      return data;
    } catch {
      return null;
    } finally {
      inflight.current.delete(ticker);
    }
  }

  // Cycle every CYCLE_MS while not paused.
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % ROTATION.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [paused]);

  // When the index changes, swap the visible card to the cached value or
  // load it. If load fails, advance to the next ticker.
  useEffect(() => {
    let cancelled = false;
    const ticker = ROTATION[index];
    (async () => {
      const data = await ensureTicker(ticker);
      if (cancelled) return;
      if (data) {
        setCurrent(data);
      } else {
        // Skip this slot if it can't load.
        setIndex((i) => (i + 1) % ROTATION.length);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Prefetch the next ticker so the cycle is snappy.
  useEffect(() => {
    const next = ROTATION[(index + 1) % ROTATION.length];
    void ensureTicker(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

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

      <div className="demo-dots" role="tablist" aria-label="Demo ticker carousel">
        {ROTATION.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show ${t}`}
            className={`demo-dot ${i === index ? "active" : ""}`}
            onClick={() => setIndex(i)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
