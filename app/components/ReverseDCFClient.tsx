"use client";

import { useMemo, useState } from "react";
import { solveImpliedGrowth } from "@/lib/valuation/reverse-dcf";
import type { ReverseDcfModel } from "@/lib/valuation/reverse-dcf-model";

const COE_MIN = 0.06;
const COE_MAX = 0.14;
const COE_STEP = 0.005;
const TG_MIN = 0.0;
const TG_MAX = 0.04;
const TG_STEP = 0.0025;
/** Terminal growth is always held this far below the discount rate so the Gordon
 *  denominator (r − gT) stays positive and the solver never returns "invalid"
 *  mid-drag — the invalid region is simply unreachable in the UI. */
const TG_HEADROOM = 0.005;

function pct(fraction: number, digits = 1): string {
  return `${fraction >= 0 ? "" : "-"}${(Math.abs(fraction) * 100).toFixed(digits)}%`;
}

function fmtUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Signed bar (origin at 0, positive right / negative left) over a shared domain.
 *  No CSS transition — the width is set per render so it tracks the slider
 *  instantly rather than lagging behind a compositor animation. */
function GrowthBar({ value, domain, tone }: { value: number; domain: number; tone: "implied" | "baseline" }) {
  const magnitude = Math.min(Math.abs(value) / domain, 1) * 50;
  const positive = value >= 0;
  const style = positive ? { left: "50%", width: `${magnitude}%` } : { right: "50%", width: `${magnitude}%` };
  return (
    <div className="rdcf-bar" aria-hidden="true">
      <span className={`rdcf-bar-fill ${tone} ${positive ? "pos" : "neg"}`} style={style} />
    </div>
  );
}

export default function ReverseDCFClient({ model }: { model: ReverseDcfModel }) {
  const [coe, setCoe] = useState(model.defaultCostOfEquity);
  const [tgRaw, setTgRaw] = useState(model.defaultTerminalGrowth);

  // Clamp terminal growth below the discount rate at render time (not just in
  // the solver): the slider's max follows the discount rate, so dragging can
  // never enter the invalid region and the readout stays live.
  const termMax = Math.max(TG_MIN, Math.min(TG_MAX, coe - TG_HEADROOM));
  const tg = Math.min(tgRaw, termMax);

  const implied = useMemo(
    () =>
      solveImpliedGrowth({
        marketCap: model.marketCap,
        baseFcf: model.baseFcf,
        costOfEquity: coe,
        terminalGrowth: tg,
      }),
    [model.marketCap, model.baseFcf, coe, tg]
  );

  const baseline = model.baseline;
  const impliedValue =
    implied.kind === "invalid" ? null : implied.growth;
  const domain = Math.max(0.2, Math.abs(impliedValue ?? 0), Math.abs(baseline.growth ?? 0));

  return (
    <div className="rdcf">
      <p className="rdcf-lede">
        Working the DCF <em>backward</em>: holding the assumptions below, this is the free-cash-flow
        growth today&apos;s price implies over the next 10 years. It is a read on the price&apos;s
        embedded expectations — <strong>not</strong> a fair-value or target price.
      </p>

      <div className="rdcf-headline">
        {impliedValue === null ? (
          <span className="rdcf-implied-val">—</span>
        ) : implied.kind === "below_floor" ? (
          <>
            <span className="rdcf-implied-val">&lt; {pct(impliedValue, 0)}/yr</span>
            <span className="rdcf-implied-cap">price implies an FCF decline beyond the model floor</span>
          </>
        ) : implied.kind === "above_ceiling" ? (
          <>
            <span className="rdcf-implied-val">&gt; {pct(impliedValue, 0)}/yr</span>
            <span className="rdcf-implied-cap">price implies growth beyond the model ceiling</span>
          </>
        ) : (
          <>
            <span className="rdcf-implied-val">{pct(impliedValue)}/yr</span>
            <span className="rdcf-implied-cap">implied FCF growth, 10-year horizon</span>
          </>
        )}
      </div>

      <div className="rdcf-bars">
        <div className="rdcf-bar-row">
          <span className="rdcf-bar-label">Implied by price</span>
          <GrowthBar value={impliedValue ?? 0} domain={domain} tone="implied" />
          <span className="rdcf-bar-val">{impliedValue === null ? "—" : pct(impliedValue)}</span>
        </div>
        <div className="rdcf-bar-row">
          <span className="rdcf-bar-label">{baseline.label}</span>
          {baseline.growth === null ? (
            <div className="rdcf-bar" aria-hidden="true" />
          ) : (
            <GrowthBar value={baseline.growth} domain={domain} tone="baseline" />
          )}
          <span className="rdcf-bar-val">{baseline.growth === null ? "n/a" : pct(baseline.growth)}</span>
        </div>
      </div>

      {impliedValue !== null && baseline.growth !== null && (
        <p className="rdcf-compare">
          The price implies FCF growth{" "}
          <strong className={impliedValue >= baseline.growth ? "rdcf-hot" : "rdcf-cool"}>
            {impliedValue >= baseline.growth ? "above" : "below"}
          </strong>{" "}
          the {baseline.kind === "consensus" ? "analyst consensus" : "company's own history"} of{" "}
          {pct(baseline.growth)}/yr
          {baseline.kind === "consensus" ? " (revenue basis)" : ""}.
        </p>
      )}

      <div className="rdcf-controls">
        <label className="rdcf-control">
          <span className="rdcf-control-head">
            Discount rate (cost of equity) <strong>{pct(coe)}</strong>
          </span>
          <input
            type="range"
            min={COE_MIN}
            max={COE_MAX}
            step={COE_STEP}
            value={coe}
            onChange={(e) => setCoe(Number(e.target.value))}
            aria-label="Discount rate (cost of equity)"
          />
        </label>
        <label className="rdcf-control">
          <span className="rdcf-control-head">
            Terminal growth <strong>{pct(tg)}</strong>
          </span>
          <input
            type="range"
            min={TG_MIN}
            max={termMax}
            step={TG_STEP}
            value={tg}
            onChange={(e) => setTgRaw(Number(e.target.value))}
            aria-label="Terminal growth rate"
          />
        </label>
      </div>

      <p className="rdcf-basis">
        Base free cash flow <strong>{fmtUsd(model.baseFcf)}</strong>
        {model.currency && model.currency !== "USD" ? ` ${model.currency}` : ""} ({model.baseFcfLabel};
        latest year {fmtUsd(model.latestFcf)}) · equity value {fmtUsd(model.marketCap)} · levered FCF
        discounted at the cost of equity. Reverse DCF is illustrative, not advice.
      </p>
    </div>
  );
}
