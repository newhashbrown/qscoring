import { getFactorExposures } from "@/lib/scoring/factor-exposures";
import type { FactorExposure, FactorKey } from "@/lib/scoring/types";

// Tier 3 "Factor Profile": the stock's Fama-French exposures, read from D1
// (precomputed monthly — no compute here). Renders flags honestly: an
// insufficient-history name shows a plain explanation instead of empty bars; a
// low-fit name shows a quiet caveat under the bars.

// Per-dimension significance gate (mirrors classify.py BETA_SIG_TSTAT). Betas
// that don't clear it are dimmed — the loading is shown, but not emphasized.
const SIG_T = 1.96;
// Half the bar width corresponds to this |beta|; larger loadings clamp to full.
const MAX_ABS_BETA = 2.0;
const MIN_OBS = 36;

const FACTOR_ROWS: { key: FactorKey; label: string }[] = [
  { key: "mktRf", label: "Market (Mkt-RF)" },
  { key: "smb", label: "Size (SMB)" },
  { key: "hml", label: "Value (HML)" },
  { key: "rmw", label: "Profitability (RMW)" },
  { key: "cma", label: "Investment (CMA)" },
  { key: "mom", label: "Momentum (MOM)" },
];

function signedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function BetaBar({ beta, tstat }: { beta: number | null; tstat: number | null }) {
  if (beta === null || !Number.isFinite(beta)) {
    return <div className="fp-bar" aria-hidden="true" />;
  }
  const magnitude = Math.min(Math.abs(beta) / MAX_ABS_BETA, 1) * 50;
  const positive = beta >= 0;
  const significant = tstat !== null && Math.abs(tstat) >= SIG_T;
  const style = positive
    ? { left: "50%", width: `${magnitude}%` }
    : { right: "50%", width: `${magnitude}%` };
  return (
    <div className="fp-bar" aria-hidden="true">
      <span
        className={`fp-bar-fill ${positive ? "pos" : "neg"}${significant ? "" : " insig"}`}
        style={style}
      />
    </div>
  );
}

function FactorRow({
  label,
  beta,
  tstat,
}: {
  label: string;
  beta: number | null;
  tstat: number | null;
}) {
  const significant = tstat !== null && Math.abs(tstat) >= SIG_T;
  return (
    <div className="fp-row">
      <span className="fp-name">{label}</span>
      <BetaBar beta={beta} tstat={tstat} />
      <span className={`fp-beta${significant ? "" : " fp-insig"}`}>
        {beta === null || !Number.isFinite(beta) ? "—" : beta.toFixed(2)}
        {tstat !== null && Number.isFinite(tstat) && (
          <span className="fp-tstat"> t{tstat >= 0 ? "+" : ""}{tstat.toFixed(1)}</span>
        )}
      </span>
    </div>
  );
}

function ExposureBody({ data }: { data: FactorExposure }) {
  const lowFit = data.flags.includes("low_explanatory_power");
  const windowText =
    data.windowStart && data.windowEnd
      ? `${data.windowStart} → ${data.windowEnd} · ${data.nObs} mo`
      : `${data.nObs} mo`;
  return (
    <div className="signal-body">
      <div className="as-block">
        <div className="as-row">
          <span className="as-label">Style</span>
          <span className="as-value">
            <strong>{data.styleLabel ?? "—"}</strong>
          </span>
        </div>
        <div className="fp-bars">
          {FACTOR_ROWS.map((f) => (
            <FactorRow
              key={f.key}
              label={f.label}
              beta={data.betas[f.key]}
              tstat={data.tstats[f.key]}
            />
          ))}
        </div>
      </div>

      <div className="as-block">
        <div className="fp-stats">
          <span>
            Annualized α <strong>{signedPct(data.alphaAnnualized)}</strong>
            {data.alphaTstat !== null && Number.isFinite(data.alphaTstat) && (
              <span className="fp-tstat"> t{data.alphaTstat >= 0 ? "+" : ""}{data.alphaTstat.toFixed(1)}</span>
            )}
          </span>
          <span>
            R² <strong>{data.r2 === null ? "—" : data.r2.toFixed(2)}</strong>
          </span>
          <span className="fp-window">{windowText}</span>
        </div>
        {lowFit && (
          <p className="as-detail fp-caveat">
            Low explanatory power (R² {data.r2 === null ? "—" : data.r2.toFixed(2)}) — the
            factor model explains little of this stock&apos;s return variation, so these
            exposures are noisy. Interpret with caution.
          </p>
        )}
        <p className="as-detail">
          Fama-French 5-factor (2×3) + Momentum, monthly OLS with Newey-West errors.
          Bars show signed factor betas; faded bars/figures aren&apos;t statistically
          significant.
        </p>
      </div>
    </div>
  );
}

function InsufficientBody({ data }: { data: FactorExposure }) {
  return (
    <div className="signal-body">
      <div className="as-block">
        <p className="as-detail">
          Not enough return history to estimate factor exposures — {data.nObs} of{" "}
          {MIN_OBS} months required. This stock is too recently listed (or has too
          short a price history) for a reliable Fama-French regression.
        </p>
      </div>
    </div>
  );
}

export default async function FactorProfile({ ticker }: { ticker: string }) {
  const data = await getFactorExposures(ticker);
  if (!data) return null; // no row yet (off-universe / not computed) — hide section

  const insufficient = data.flags.includes("insufficient_history");

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Tier 3</span>
        <span className="signal-title">Factor Profile</span>
      </summary>
      {insufficient ? <InsufficientBody data={data} /> : <ExposureBody data={data} />}
    </details>
  );
}

export function FactorProfileSkeleton() {
  return (
    <section className="signal-section skeleton" aria-hidden="true">
      <div className="signal-summary-skel" />
    </section>
  );
}
