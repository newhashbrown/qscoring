"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import TickerSearch from "./TickerSearch";

const PRIMARY_LINKS: Array<{ href: string; label: string }> = [
  { href: "/score", label: "Score" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/compare", label: "Compare" },
  { href: "/performance", label: "Performance" },
  { href: "/blog", label: "Blog" },
  { href: "/methodology", label: "Methodology" },
];

type Props = {
  ticker?: string;
  /** Hide the inline ticker search — used on the homepage where the hero already has one. */
  showSearch?: boolean;
};

export default function ScoreNav({ ticker, showSearch = true }: Props) {
  const [open, setOpen] = useState(false);

  // Close the mobile menu on Escape so keyboard users aren't trapped.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className={`site-nav ${open ? "open" : ""}`}>
      <Link
        href="/"
        className="logo logo-image"
        aria-label="QScoring.com home"
        onClick={() => setOpen(false)}
      >
        <Image
          src="/logo.png"
          alt="QScoring"
          width={144}
          height={92}
          priority
          // Source asset is pre-sized for ~46px display @ 2x retina.
          // Aspect ratio matches the original 1291x823 source.
          style={{ height: 46, width: "auto" }}
        />
      </Link>

      <ul className="site-nav-links" role="menubar">
        {PRIMARY_LINKS.map((l) => (
          <li key={l.href} role="none">
            <Link
              href={l.href}
              role="menuitem"
              className="site-nav-link"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="site-nav-tail">
        {showSearch && (
          <div className="site-nav-search">
            <TickerSearch initialValue={ticker ?? ""} size="compact" />
          </div>
        )}
        <Link href="/#signup" className="nav-cta" onClick={() => setOpen(false)}>
          Get Early Access
        </Link>
      </div>

      <button
        type="button"
        className="site-nav-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="site-nav-toggle-bar" />
        <span className="site-nav-toggle-bar" />
        <span className="site-nav-toggle-bar" />
      </button>
    </nav>
  );
}
