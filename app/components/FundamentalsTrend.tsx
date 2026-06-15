import { fmp } from "@/lib/scoring/fmp";
import {
  buildFundamentalsTrend,
  nextEarningsStaleFlag,
  type DollarMetricYear,
  type FundamentalsYear,
  type MarginYear,
} from "@/lib/scoring/fundamentals";

// Local compact formatters. Statement values are large ($B/$M); EPS is small
// dollars, so it gets its own path.
function fmtUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtEps(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function fmtPct(fraction: number | null, digits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

function fmtPoints(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return "";
  const pp = fraction * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
}

const DISTORTION_TITLE: Record<"low_base" | "sign_change", string> = {
  low_base:
    "Large percentage off a small prior-year base — the change looks dramatic but the dollar move is small. Read the absolute figure, not the %.",
  sign_change:
    "Prior-year value was zero or negative, so a year-over-year percentage isn't meaningful (n/m).",
};

function YoYChip({ m }: { m: DollarMetricYear }) {
  if (m.distortion === "sign_change") {
    return (
      <span className="yoy-chip nm" title={DISTORTION_TITLE.sign_change}>
        n/m
      </span>
    );
  }
  if (m.yoyPct === null || !m.meaningful) {
    return <span className="yoy-chip flat">—</span>;
  }
  const up = m.yoyPct >= 0;
  const pct = `${up ? "+" : ""}${(m.yoyPct * 100).toFixed(1)}%`;
  return (
    <span
      className={`yoy-chip ${up ? "up" : "down"}${m.distortion === "low_base" ? " distorted" : ""}`}
      title={m.distortion === "low_base" ? DISTORTION_TITLE.low_base : undefined}
    >
      {pct}
      {m.distortion === "low_base" && (
        <span aria-hidden="true" className="distort-mark">
          {" "}
          ⚠
        </span>
      )}
    </span>
  );
}

function MarginCell({ m }: { m: MarginYear }) {
  const up = (m.yoyPoints ?? 0) >= 0;
  return (
    <div className="ft-cell">
      <span className="ft-value">{fmtPct(m.value)}</span>
      {m.yoyPoints !== null && (
        <span className={`yoy-chip ${up ? "up" : "down"}`}>{fmtPoints(m.yoyPoints)}</span>
      )}
    </div>
  );
}

function DollarCell({ m, kind }: { m: DollarMetricYear; kind: "usd" | "eps" }) {
  return (
    <div className="ft-cell">
      <span className="ft-value">{kind === "eps" ? fmtEps(m.value) : fmtUsd(m.value)}</span>
      <YoYChip m={m} />
    </div>
  );
}

function colLabel(y: FundamentalsYear): string {
  return y.period === "FY" ? `FY${y.fiscalYear}` : `${y.fiscalYear} ${y.period}`;
}

function asOfCaption(latest: FundamentalsYear): string {
  const end = latest.fiscalPeriodEnd;
  const filed = latest.filingDate ? `, filed ${latest.filingDate}` : "";
  return `As of ${colLabel(latest)} — period ended ${end}${filed}`;
}

export default async function FundamentalsTrend({ ticker }: { ticker: string }) {
  const [income, cashflow, earnings] = await Promise.all([
    fmp.incomeStatement(ticker, 5).catch(() => []),
    fmp.cashFlowStatement(ticker, 5).catch(() => []),
    fmp.earnings(ticker, 8).catch(() => []),
  ]);

  const trend = buildFundamentalsTrend(income, cashflow);
  // No multi-year statement coverage — render nothing rather than an empty shell.
  if (trend.years.length === 0) return null;

  const stale = nextEarningsStaleFlag(earnings);
  const latest = trend.years[trend.years.length - 1];
  const years = trend.years;

  const dollarRows: Array<{ label: string; pick: (y: FundamentalsYear) => DollarMetricYear; kind: "usd" | "eps" }> = [
    { label: "Revenue", pick: (y) => y.revenue, kind: "usd" },
    { label: "EPS (dil.)", pick: (y) => y.eps, kind: "eps" },
    { label: "Free Cash Flow", pick: (y) => y.freeCashFlow, kind: "usd" },
  ];
  const marginRows: Array<{ label: string; pick: (y: FundamentalsYear) => MarginYear }> = [
    { label: "Gross Margin", pick: (y) => y.grossMargin },
    { label: "Operating Margin", pick: (y) => y.operatingMargin },
    { label: "Net Margin", pick: (y) => y.netMargin },
  ];

  return (
    <section className="fundamentals-trend" aria-labelledby="ft-heading">
      <div className="ft-head">
        <h3 id="ft-heading">
          Growth in depth — {years.length}-year fundamentals
        </h3>
        <div className="ft-meta">
          <span className="ft-asof" title={latest.filingDate ? `Filed ${latest.filingDate}` : undefined}>
            {asOfCaption(latest)}
          </span>
          {stale.stale && stale.nextEarningsDate && (
            <span
              className="stale-pill"
              title={`Next earnings ${stale.nextEarningsDate} — about ${stale.tradingDaysAway} trading day(s) away. These figures may be superseded shortly.`}
            >
              Earnings due {stale.nextEarningsDate}
              <span className="visually-hidden">
                {" "}— fundamentals below may be superseded within {stale.tradingDaysAway} trading days
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="ft-scroll">
        <table className="ft-table">
          <thead>
            <tr>
              <th scope="col" className="ft-rowhead">
                {trend.currency ? `Metric (${trend.currency})` : "Metric"}
              </th>
              {years.map((y) => (
                <th key={y.fiscalYear} scope="col" title={y.filingDate ? `Filed ${y.filingDate}` : undefined}>
                  {colLabel(y)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dollarRows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="ft-rowhead">{row.label}</th>
                {years.map((y) => (
                  <td key={y.fiscalYear}>
                    <DollarCell m={row.pick(y)} kind={row.kind} />
                  </td>
                ))}
              </tr>
            ))}
            {marginRows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="ft-rowhead">{row.label}</th>
                {years.map((y) => (
                  <td key={y.fiscalYear}>
                    <MarginCell m={row.pick(y)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ft-footnote">
        Absolute figures with year-over-year change. Margins show the level with
        the change in percentage points (pp). “n/m” = not meaningful (prior ≤ 0);
        ⚠ marks a large percentage off a small base — read the dollar figure.
      </p>
    </section>
  );
}

export function FundamentalsTrendSkeleton() {
  return (
    <section className="fundamentals-trend skeleton" aria-hidden="true">
      <div className="ft-head">
        <h3>Growth in depth — 5-year fundamentals</h3>
      </div>
      <div className="ft-skeleton-rows">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ft-skeleton-row" />
        ))}
      </div>
    </section>
  );
}
