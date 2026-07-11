import { getCloudflareContext } from "@opennextjs/cloudflare";
import { EVENT_TYPES, type EventType, type EventDetails } from "./types";
import { parseNarrative, NARRATIVE_PROMPT_VERSION } from "@/lib/narratives/types";

// Read-only access for the "Upcoming Catalysts" component (Phase 4). Reads the
// upcoming events (migrations/0012) and the narrative catalyst_watch. Outside a
// Worker (next dev / scripts) getCloudflareContext throws and these return
// empty, so the component degrades to "no data".
//
// NOTE on catalyst_watch: it is a FREE narrative section (in FREE_SECTIONS), so
// reading it directly from D1 here is NOT a paid-content bypass — the tier gate
// still owns the decision, this path just consumes what the gate marks free.

export type UpcomingEvent = {
  eventType: EventType;
  eventDate: string;
  details: EventDetails | null;
};

function getDb(): D1Database | null {
  try {
    return (getCloudflareContext()?.env as { DB?: D1Database } | undefined)?.DB ?? null;
  } catch {
    return null;
  }
}

/** Today (UTC) as YYYY-MM-DD — the "upcoming" boundary. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Upcoming events for a ticker, soonest first. Empty when absent / off-Worker. */
export async function getUpcomingEvents(ticker: string): Promise<UpcomingEvent[]> {
  const db = getDb();
  if (!db) return [];
  const cleaned = ticker.toUpperCase();
  try {
    const { results } = await db
      .prepare(
        `SELECT event_type, event_date, details_json
           FROM ticker_events
          WHERE ticker = ?1 AND event_date >= ?2
          ORDER BY event_date ASC
          LIMIT 20`
      )
      .bind(cleaned, todayUtc())
      .all<{ event_type: string; event_date: string; details_json: string | null }>();
    return (results ?? [])
      .filter((r) => (EVENT_TYPES as readonly string[]).includes(r.event_type))
      .map((r) => {
        let details: EventDetails | null = null;
        try {
          details = r.details_json ? (JSON.parse(r.details_json) as EventDetails) : null;
        } catch {
          details = null;
        }
        return { eventType: r.event_type as EventType, eventDate: r.event_date, details };
      });
  } catch (err) {
    console.error(`ticker_events read failed (${cleaned}):`, err);
    return [];
  }
}

/** The narrative catalyst_watch items (FREE section), or [] when unavailable. */
export async function getCatalystWatch(ticker: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const cleaned = ticker.toUpperCase();
  try {
    const row = await db
      .prepare(
        `SELECT narrative_json FROM ticker_narratives
          WHERE ticker = ?1 AND prompt_version = ?2
          ORDER BY data_as_of DESC LIMIT 1`
      )
      .bind(cleaned, NARRATIVE_PROMPT_VERSION)
      .first<{ narrative_json: string }>();
    if (!row) return [];
    const narrative = parseNarrative(JSON.parse(row.narrative_json));
    return narrative?.catalyst_watch ?? [];
  } catch (err) {
    console.error(`catalyst_watch read failed (${cleaned}):`, err);
    return [];
  }
}
