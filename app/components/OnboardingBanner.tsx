"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "qs_onboarding_seen";

const FACTORS = [
  { label: "Value",         desc: "Is the stock priced fairly vs. earnings and assets?" },
  { label: "Growth",        desc: "Are revenues and earnings expanding?" },
  { label: "Momentum",      desc: "Is price trending in the right direction?" },
  { label: "Profitability", desc: "Does the business generate strong returns on capital?" },
  { label: "Risk",          desc: "How volatile and leveraged is the company?" },
] as const;

export default function OnboardingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className="onboarding-banner" role="note" aria-label="How to read a QScore">
      <div className="onboarding-header">
        <span className="onboarding-eyebrow">New to QScoring?</span>
        <button
          type="button"
          className="onboarding-close"
          onClick={dismiss}
          aria-label="Dismiss orientation banner"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="12" y2="12" />
            <line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      <div className="onboarding-grid">
        <div className="onboarding-section">
          <div className="onboarding-section-title">Score (0–100)</div>
          <p className="onboarding-section-body">
            Higher is stronger. <strong>65+</strong> = buy signal,{" "}
            <strong>40–64</strong> = hold, <strong>below 40</strong> = short.
            Long-term and short-term scores weight the same factors differently.
          </p>
        </div>

        <div className="onboarding-section">
          <div className="onboarding-section-title">Confidence</div>
          <p className="onboarding-section-body">
            Reflects data completeness. <strong>HIGH</strong> = all metrics
            available. <strong>MEDIUM</strong> = minor gaps.{" "}
            <strong>LOW</strong> = significant missing data — treat scores with
            extra caution.
          </p>
        </div>

        <div className="onboarding-section">
          <div className="onboarding-section-title">5 Factors</div>
          <div className="onboarding-factors">
            {FACTORS.map((f) => (
              <span key={f.label} className="onboarding-factor-pill" title={f.desc}>
                {f.label}
              </span>
            ))}
          </div>
          <p className="onboarding-section-body">
            Each factor scores 0–100. Hover a pill to see what it measures.
          </p>
        </div>
      </div>

      <div className="onboarding-footer">
        <Link href="/methodology" className="onboarding-link" onClick={dismiss}>
          Full methodology →
        </Link>
        <button type="button" className="onboarding-got-it" onClick={dismiss}>
          Got it
        </button>
      </div>
    </aside>
  );
}
