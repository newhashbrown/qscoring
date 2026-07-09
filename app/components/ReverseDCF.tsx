import { fmp } from "@/lib/scoring/fmp";
import { buildReverseDcfModel } from "@/lib/valuation/reverse-dcf-model";
import ReverseDCFClient from "./ReverseDCFClient";

// Phase 2 "Reverse DCF": rather than output a fair value, invert the DCF to show
// the FCF growth the current PRICE implies. Inputs are fetched live from FMP
// (levered FCF + market cap; optional analyst consensus, which is frequently
// plan-gated → we degrade to historical FCF growth). The math + assumption
// sliders live in the client child; this server component only assembles the
// grounded model and hides the section when a reverse DCF can't be stated.

export default async function ReverseDCF({ ticker }: { ticker: string }) {
  const [cashflow, profile, income, estimates] = await Promise.all([
    fmp.cashFlowStatement(ticker, 5).catch(() => []),
    fmp.profile(ticker).catch(() => []),
    fmp.incomeStatement(ticker, 5).catch(() => []),
    // Consensus is a bonus, not a dependency: a plan-gated 402 (or any error)
    // just means no consensus baseline — the model falls back to history.
    fmp.analystEstimates(ticker, 5).catch(() => []),
  ]);

  const model = buildReverseDcfModel({ cashflow, profile, income, estimates });
  if (!model) return null; // no FCF history / non-positive base ⇒ no honest reverse DCF

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Valuation</span>
        <span className="signal-title">Reverse DCF — what the price implies</span>
      </summary>
      <div className="signal-body">
        <ReverseDCFClient model={model} />
      </div>
    </details>
  );
}

export function ReverseDCFSkeleton() {
  return (
    <section className="signal-section skeleton" aria-hidden="true">
      <div className="signal-summary-skel" />
    </section>
  );
}
