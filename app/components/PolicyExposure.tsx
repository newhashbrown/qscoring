import { getPolicyExposures } from "@/lib/policy/read";
import { POLICY_TAGS, LEVEL_RANK, type PolicyLevel } from "@/lib/policy/types";

// Phase 3 "Policy Exposure": AI classification of the company's sensitivity to
// six policy themes (none/low/medium/high + a one-line rationale), read straight
// from D1 (migrations/0011) — no Anthropic/FMP call at request time. Renders
// nothing when there's no stored classification, so the section self-hides.

const LEVEL_LABEL: Record<PolicyLevel, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export default async function PolicyExposure({ ticker }: { ticker: string }) {
  const rec = await getPolicyExposures(ticker);
  if (!rec) return null;

  // Highest exposure first so the themes that matter lead.
  const rows = POLICY_TAGS.map((t) => ({ key: t.key, label: t.label, ...rec.exposures[t.key] })).sort(
    (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]
  );

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Policy</span>
        <span className="signal-title">Policy Exposure</span>
      </summary>
      <div className="signal-body">
        <div className="policy-rows">
          {rows.map((r) => (
            <div className="policy-row" key={r.key}>
              <span className="policy-tag">{r.label}</span>
              <span className={`policy-badge lvl-${r.level}`}>{LEVEL_LABEL[r.level]}</span>
              <span className="policy-rationale">{r.rationale}</span>
            </div>
          ))}
        </div>
        <p className="as-detail">
          AI classification of policy/regulatory sensitivity from the company&apos;s sector, industry,
          and business description. Exposure/sensitivity only — not a political opinion, a prediction of
          government action, or investment advice. As of {rec.dataAsOf}.
        </p>
      </div>
    </details>
  );
}

export function PolicyExposureSkeleton() {
  return (
    <section className="signal-section skeleton" aria-hidden="true">
      <div className="signal-summary-skel" />
    </section>
  );
}
