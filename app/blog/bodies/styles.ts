import type { CSSProperties } from "react";

/**
 * Shared inline styles for blog post Body() components.
 *
 * These were originally inlined at the top of each of the five
 * `app/blog/bodies/*.tsx` files (PRs #3, #4, #5, #6, #9), producing
 * ~80 lines of copy-paste. Extracted here so adding a sixth post
 * doesn't grow the duplication. Behavior is unchanged.
 *
 * Why CSS-in-JS rather than CSS classes in `globals.css`: the figures
 * are scoped to body components, so colocating the styles with their
 * only consumer keeps `globals.css` from picking up another batch of
 * `.blog-figure*` selectors it would have to ship to every page in
 * the cold-start parse.
 */

export const figureStyle: CSSProperties = { margin: "32px 0" };

export const imgStyle: CSSProperties = {
  width: "100%",
  height: "auto",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  display: "block",
};

export const captionStyle: CSSProperties = {
  marginTop: 12,
  fontSize: "0.85rem",
  color: "var(--text-muted)",
  lineHeight: 1.55,
};

export const captionLabel: CSSProperties = { color: "var(--text-dim)" };
