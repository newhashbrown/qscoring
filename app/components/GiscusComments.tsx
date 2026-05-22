"use client";

import { useEffect, useRef } from "react";

/**
 * GitHub Discussions-backed comments for blog posts, powered by Giscus.
 *
 * Setup notes (already done as of the PR that added this):
 *   - Comments repo: github.com/newhashbrown/qscoring-comments (public,
 *     Discussions enabled).
 *   - Giscus GitHub App installed on that repo so it can read/write
 *     discussion threads on behalf of commenters.
 *   - Category set to "Announcements" so only maintainers can create
 *     new threads — Giscus auto-creates them per-pathname the first
 *     time someone comments on a post.
 *
 * Why Giscus rather than Disqus / Cusdis / Hyvor: zero third-party
 * tracking, comments live in GitHub Discussions (durable, searchable,
 * portable), authentication is GitHub OAuth (no separate accounts),
 * and the embed is iframe-isolated so it can't break the host page.
 *
 * Why this is a client component: Giscus injects an iframe via a
 * script tag that mutates the DOM, which has to run after hydration.
 * The SSR pass returns an empty wrapper; the script populates it.
 */
export default function GiscusComments() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || node.querySelector("iframe.giscus-frame")) return;

    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-repo", "newhashbrown/qscoring-comments");
    script.setAttribute("data-repo-id", "R_kgDOSlTttQ");
    script.setAttribute("data-category", "Announcements");
    script.setAttribute("data-category-id", "DIC_kwDOSlTttc4C9o8w");
    script.setAttribute("data-mapping", "pathname");
    script.setAttribute("data-strict", "0");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "top");
    script.setAttribute("data-theme", "transparent_dark");
    script.setAttribute("data-lang", "en");
    script.setAttribute("data-loading", "lazy");
    node.appendChild(script);
  }, []);

  return <div ref={ref} className="giscus-wrapper" />;
}
