"use client";

import { useEffect, useState } from "react";

// Step 2 of Consent Mode v2 (defaults are set denied in app/layout.tsx).
// On the user's choice we call gtag('consent','update',{...}) and persist it,
// so a returning visitor's choice is re-applied on load (inside the
// wait_for_update window) without re-prompting.

const STORAGE_KEY = "qs_cookie_consent"; // "granted" | "denied"

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function updateConsent(value: "granted" | "denied") {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  // Prefer the page's real gtag() (defined by the GA snippet in layout.tsx)
  // for identical behavior; fall back to the standard dataLayer shim (pushes
  // the arguments object) when gtag.js hasn't loaded yet or in dev.
  const gtag: (...args: unknown[]) => void =
    window.gtag ??
    function () {
      window.dataLayer!.push(arguments);
    };
  gtag("consent", "update", {
    analytics_storage: value,
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  });
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage blocked (private mode / cookies off) — show the banner.
    }
    if (stored === "granted" || stored === "denied") {
      // Returning visitor: re-apply their choice on top of the denied default.
      updateConsent(stored);
    } else {
      setVisible(true);
    }
  }, []);

  function choose(value: "granted" | "denied") {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore — consent still applies for this session below
    }
    updateConsent(value);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent" aria-live="polite">
      <p className="cookie-banner-text">
        QScoring uses analytics cookies to understand how the site is used. We only set them
        if you accept — declining keeps analytics off.
      </p>
      <div className="cookie-banner-actions">
        <button type="button" className="cookie-btn decline" onClick={() => choose("denied")}>
          Decline
        </button>
        <button type="button" className="cookie-btn accept" onClick={() => choose("granted")}>
          Accept
        </button>
      </div>
    </div>
  );
}
