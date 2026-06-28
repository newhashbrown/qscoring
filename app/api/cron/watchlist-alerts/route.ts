import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { timingSafeEqual } from "@/lib/request-guards";
import { sendEmail } from "@/lib/email/send";
import {
  digestHtml,
  digestSubject,
  digestText,
  type SignalChange,
} from "@/lib/email/watchlist-alert";
import scoreboardData from "@/data/scoreboard.json";
import type { ScoreboardPick } from "@/data/categories";

// POST /api/cron/watchlist-alerts
//
// Compares each watchlist_entries row to the current scoreboard, sends a
// per-user digest email summarizing all signal changes since the last
// notification, and updates last_signal / last_composite / last_notified_at.
//
// Auth: Bearer token in Authorization header. The token is the
// WATCHLIST_CRON_TOKEN secret stored in Cloudflare; the daily GitHub
// Action that pushes the snapshot also has it as a repo secret and
// curls this endpoint after the deploy.
//
// Scope: only tickers present in scoreboard.json get checked. Long-tail
// watches (tickers outside the universe) silently skip — adding live
// scoreTicker() calls per long-tail watch would multiply FMP load
// dramatically. Future improvement once the universe expands.

type WatchlistRow = {
  id: number;
  email: string;
  ticker: string;
  last_signal: string | null;
  last_composite: number | null;
  unsubscribe_token: string;
  notification_count: number;
};

function lookupPick(ticker: string): ScoreboardPick | null {
  return (scoreboardData.picks as ScoreboardPick[]).find((p) => p.ticker === ticker) ?? null;
}

export async function POST(req: Request) {
  let cf;
  try {
    cf = getCloudflareContext();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cloudflare context not available" },
      { status: 503 }
    );
  }

  const env = cf?.env as { WATCHLIST_CRON_TOKEN?: string; DB?: D1Database } | undefined;
  const expectedToken = (env?.WATCHLIST_CRON_TOKEN ?? "").trim();
  const auth = req.headers.get("authorization") ?? "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expectedToken || !(await timingSafeEqual(got, expectedToken))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = env?.DB;
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Database binding missing" },
      { status: 503 }
    );
  }

  // Pull the watchlist with a hard cap. 5000 rows comfortably fits in a
  // single D1 response and processes inside the Worker CPU budget; past
  // that we need to paginate by ticker. When we approach the cap we log a
  // structured warning so the cap can be raised (or pagination added)
  // before silent data loss kicks in.
  const WATCHLIST_QUERY_LIMIT = 5000;
  const WATCHLIST_WARN_THRESHOLD = Math.floor(WATCHLIST_QUERY_LIMIT * 0.8);
  let rows: WatchlistRow[] = [];
  try {
    const result = await db
      .prepare(
        `SELECT id, email, ticker, last_signal, last_composite,
                unsubscribe_token, notification_count
         FROM watchlist_entries
         LIMIT ?`
      )
      .bind(WATCHLIST_QUERY_LIMIT)
      .all<WatchlistRow>();
    rows = (result.results ?? []) as WatchlistRow[];
    if (rows.length >= WATCHLIST_WARN_THRESHOLD) {
      console.warn(
        `watchlist-alerts: ${rows.length}/${WATCHLIST_QUERY_LIMIT} rows — approaching cap, time to paginate`
      );
    }
  } catch (err) {
    console.error("watchlist query failed:", err);
    return NextResponse.json(
      { ok: false, error: "Watchlist query failed" },
      { status: 500 }
    );
  }

  // Detect changes per row + group by recipient email for digests.
  const changesByEmail = new Map<string, SignalChange[]>();
  const baselineUpdates: Array<{ id: number; signal: string; composite: number }> = [];
  const flippedUpdates: Array<{ id: number; signal: string; composite: number }> = [];
  const compositeOnlyUpdates: Array<{ id: number; composite: number }> = [];
  let skipped = 0;
  let baselined = 0;

  for (const row of rows) {
    const pick = lookupPick(row.ticker);
    if (!pick) {
      skipped++;
      continue;
    }
    const currentSignal = pick.signal;
    const currentComposite = pick.composite;

    if (row.last_signal === null) {
      // First time we're observing this entry. Set baseline silently.
      baselineUpdates.push({
        id: row.id,
        signal: currentSignal,
        composite: currentComposite,
      });
      baselined++;
      continue;
    }

    if (row.last_signal !== currentSignal) {
      const unsubscribeUrl = `https://qscoring.com/api/watch/unsubscribe?id=${row.id}&token=${row.unsubscribe_token}`;
      const change: SignalChange = {
        ticker: row.ticker,
        companyName: pick.companyName,
        oldSignal: row.last_signal,
        newSignal: currentSignal,
        oldComposite: row.last_composite,
        newComposite: currentComposite,
        unsubscribeUrl,
      };
      const list = changesByEmail.get(row.email) ?? [];
      list.push(change);
      changesByEmail.set(row.email, list);
      flippedUpdates.push({
        id: row.id,
        signal: currentSignal,
        composite: currentComposite,
      });
    } else if (row.last_composite !== currentComposite) {
      // Composite shifted but signal stayed — refresh the stored
      // composite without alerting.
      compositeOnlyUpdates.push({ id: row.id, composite: currentComposite });
    }
  }

  // Send digests. Wrapped in waitUntil so the response returns quickly
  // and the worker stays alive while Resend processes the sends.
  const sendPromises: Promise<void>[] = [];
  let recipientCount = 0;
  let totalChanges = 0;
  for (const [email, changes] of changesByEmail) {
    recipientCount++;
    totalChanges += changes.length;
    sendPromises.push(
      sendEmail({
        to: email,
        subject: digestSubject(changes),
        html: digestHtml(changes),
        text: digestText(changes),
      })
        .then((r) => {
          if (!r.ok) console.error(`watchlist digest [${email}] failed:`, r.error);
        })
        .catch((err) => console.error(`watchlist digest [${email}] exception:`, err))
    );
  }

  // Update D1: baseline-set, flipped (with notification bookkeeping),
  // composite-only refresh. Each one is a separate prepared statement
  // batched per row — D1 doesn't expose multi-row bulk updates cleanly.
  const dbPromise = (async () => {
    try {
      const now = new Date().toISOString();
      for (const u of baselineUpdates) {
        await db
          .prepare(
            `UPDATE watchlist_entries
             SET last_signal = ?, last_composite = ?
             WHERE id = ?`
          )
          .bind(u.signal, u.composite, u.id)
          .run();
      }
      for (const u of flippedUpdates) {
        await db
          .prepare(
            `UPDATE watchlist_entries
             SET last_signal = ?,
                 last_composite = ?,
                 last_notified_at = ?,
                 notification_count = notification_count + 1
             WHERE id = ?`
          )
          .bind(u.signal, u.composite, now, u.id)
          .run();
      }
      for (const u of compositeOnlyUpdates) {
        await db
          .prepare(
            `UPDATE watchlist_entries
             SET last_composite = ?
             WHERE id = ?`
          )
          .bind(u.composite, u.id)
          .run();
      }
    } catch (err) {
      console.error("watchlist update failed:", err);
    }
  })();

  const work = Promise.all([...sendPromises, dbPromise]);
  if (cf.ctx?.waitUntil) {
    cf.ctx.waitUntil(work);
  } else {
    await work;
  }

  return NextResponse.json({
    ok: true,
    summary: {
      totalRows: rows.length,
      baselined,
      flipped: flippedUpdates.length,
      compositeOnlyUpdated: compositeOnlyUpdates.length,
      skippedNoScoreboardEntry: skipped,
      digestsSent: recipientCount,
      totalSignalChangesAlerted: totalChanges,
    },
  });
}
