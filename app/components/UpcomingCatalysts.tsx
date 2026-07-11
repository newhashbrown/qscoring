import { getUpcomingEvents, getCatalystWatch, type UpcomingEvent } from "@/lib/events/read";
import { splitRatio, type EarningsDetails, type DividendDetails, type SplitDetails } from "@/lib/events/types";

// Phase 4 "Upcoming Catalysts": concrete dated events (earnings / ex-dividend /
// split) from D1 (migrations/0012), merged with the free narrative
// catalyst_watch. Server component, no request-time FMP/LLM call. Self-hides
// when there's nothing upcoming and no watch items.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function fmtUsd(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "";
  return `$${v.toFixed(2)}`;
}

function fmtEps(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "";
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

const ICON: Record<UpcomingEvent["eventType"], string> = {
  earnings: "📅",
  ex_dividend: "💰",
  split: "✂",
};
const KIND_LABEL: Record<UpcomingEvent["eventType"], string> = {
  earnings: "Earnings",
  ex_dividend: "Ex-dividend",
  split: "Stock split",
};

function EventDetail({ ev }: { ev: UpcomingEvent }) {
  if (ev.eventType === "earnings") {
    const d = ev.details as EarningsDetails | null;
    const eps = d ? fmtEps(d.epsEstimated) : "";
    return <span className="uc-detail">{eps ? `est. EPS ${eps}` : "estimate pending"}</span>;
  }
  if (ev.eventType === "ex_dividend") {
    const d = ev.details as DividendDetails | null;
    const amt = d ? fmtUsd(d.dividend) : "";
    const pay = d?.paymentDate ? ` · pays ${fmtDate(d.paymentDate)}` : "";
    return <span className="uc-detail">{amt ? `${amt}/sh` : "amount pending"}{pay}</span>;
  }
  const d = ev.details as SplitDetails | null;
  const ratio = d ? splitRatio(d) : null;
  return <span className="uc-detail">{ratio ? `${ratio}` : "ratio pending"}</span>;
}

export default async function UpcomingCatalysts({ ticker }: { ticker: string }) {
  const [events, watch] = await Promise.all([getUpcomingEvents(ticker), getCatalystWatch(ticker)]);
  if (events.length === 0 && watch.length === 0) return null;

  return (
    <details className="signal-section" open>
      <summary>
        <span className="section-eyebrow">Calendar</span>
        <span className="signal-title">Upcoming Catalysts</span>
      </summary>
      <div className="signal-body">
        {events.length > 0 && (
          <ul className="uc-events">
            {events.map((ev) => (
              <li className={`uc-event uc-${ev.eventType}`} key={`${ev.eventType}-${ev.eventDate}`}>
                <span className="uc-icon" aria-hidden="true">{ICON[ev.eventType]}</span>
                <span className="uc-kind">{KIND_LABEL[ev.eventType]}</span>
                <span className="uc-date">{fmtDate(ev.eventDate)}</span>
                <EventDetail ev={ev} />
              </li>
            ))}
          </ul>
        )}

        {watch.length > 0 && (
          <div className="uc-watch">
            <span className="uc-watch-head">Also watch (AI)</span>
            <ul className="uc-watch-list">
              {watch.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="as-detail">
          Dated events from the market calendar; the &ldquo;also watch&rdquo; items are AI-generated
          observations from QScoring data. Informational only — not investment advice, and dates can
          change.
        </p>
      </div>
    </details>
  );
}

export function UpcomingCatalystsSkeleton() {
  return (
    <section className="signal-section skeleton" aria-hidden="true">
      <div className="signal-summary-skel" />
    </section>
  );
}
