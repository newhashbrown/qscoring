"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // Exact root only matches root; everything else matches if the pathname
  // starts with the link's href so /score/AAPL highlights the "Score" link.
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function ScoreNav({ ticker, showSearch = true }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
          width={251}
          height={120}
          priority
          style={{ height: 60, width: "auto" }}
        />
      </Link>

      <ul className="site-nav-links">
        {PRIMARY_LINKS.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`site-nav-link ${active ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Ticker search shown in the expanded hamburger menu on mobile */}
      {showSearch && (
        <div className="site-nav-mobile-search">
          <TickerSearch initialValue={ticker ?? ""} size="compact" />
        </div>
      )}

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
