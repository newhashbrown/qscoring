"use client";

import { useState, type ReactNode } from "react";

/**
 * Client wrapper for the /movers board. Holds only the "show only divergences"
 * toggle state and flips a `.filtered` class on the board container; the CSS
 * (.movers-board.filtered .mover-card[data-divergence="false"]) does the hiding.
 *
 * The cards themselves are server-rendered and passed through as children, so
 * all content is in the initial HTML — this component adds only the toggle.
 * (A pure-CSS :has() toggle was cleaner but Lightning CSS strips :has() rules
 * for the project's browser target, so they never reach the browser.)
 */
export default function MoversBoard({
  totalDivergences,
  children,
}: {
  totalDivergences: number;
  children: ReactNode;
}) {
  const [filtered, setFiltered] = useState(false);
  return (
    <div className={`movers-board${filtered ? " filtered" : ""}`}>
      <div className="movers-toolbar">
        <button
          type="button"
          className={`movers-toggle${filtered ? " active" : ""}`}
          aria-pressed={filtered}
          onClick={() => setFiltered((v) => !v)}
        >
          Show only divergences
          <span className="movers-toggle-count">{totalDivergences}</span>
        </button>
      </div>
      <div className="movers-columns">{children}</div>
    </div>
  );
}
