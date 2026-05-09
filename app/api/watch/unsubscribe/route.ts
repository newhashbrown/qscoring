import { getCloudflareContext } from "@opennextjs/cloudflare";

// One-click unsubscribe via GET so plain mail clients can follow the link
// directly. The per-row token (16 random bytes) prevents enumeration —
// anyone clicking has to come from an email we sent. The endpoint is
// idempotent: the same link clicked twice silently no-ops.

function htmlPage(title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title} — QScoring</title>
<meta name="robots" content="noindex,nofollow">
<style>
  body { background:#0A0E17; color:#E8ECF1; font-family:-apple-system,Segoe UI,sans-serif; margin:0; padding:48px 16px; }
  .card { max-width:520px; margin:0 auto; background:#111827; border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:32px; }
  h1 { font-size:22px; margin:0 0 12px; }
  p { color:#B7C0CC; line-height:1.6; }
  a { color:#00D4AA; text-decoration:none; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${body}
    <p style="margin-top:24px;"><a href="https://qscoring.com/">← Back to QScoring</a></p>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idStr = url.searchParams.get("id");
  const token = url.searchParams.get("token");

  if (!idStr || !token || !/^\d+$/.test(idStr) || !/^[a-f0-9]{32}$/.test(token)) {
    return htmlPage(
      "Invalid unsubscribe link",
      "<p>This unsubscribe link is missing its required parameters or has the wrong shape. Try the link from the most recent confirmation email, or reply with the ticker you want to stop watching and we'll handle it manually.</p>"
    );
  }
  const id = Number(idStr);

  let cf;
  try {
    cf = getCloudflareContext();
  } catch {
    return htmlPage(
      "Unsubscribe temporarily unavailable",
      "<p>The Cloudflare context wasn't reachable. This is a transient infrastructure issue — please try the link again in a minute.</p>"
    );
  }

  const db = cf?.env?.DB;
  if (!db) {
    return htmlPage(
      "Unsubscribe temporarily unavailable",
      "<p>The database binding isn't reachable. Please try again in a minute.</p>"
    );
  }

  // Find the row by id+token. The token check guarantees only the
  // recipient of the original email can act on this URL.
  let ticker = "";
  try {
    const row = await db
      .prepare("SELECT ticker FROM watchlist_entries WHERE id = ? AND unsubscribe_token = ?")
      .bind(id, token)
      .first<{ ticker: string }>();
    if (!row) {
      return htmlPage(
        "Already unsubscribed",
        "<p>This watch entry is already gone — either you've unsubscribed before, or the link is from an older email and the entry has since been replaced. Either way, you won't get more alerts for this ticker.</p>"
      );
    }
    ticker = row.ticker;

    await db
      .prepare("DELETE FROM watchlist_entries WHERE id = ? AND unsubscribe_token = ?")
      .bind(id, token)
      .run();
  } catch (err) {
    console.error("unsubscribe failed:", err);
    return htmlPage(
      "Unsubscribe failed",
      "<p>Something went wrong on our end. Please try the link again, or reply to the confirmation email and we'll remove you manually.</p>"
    );
  }

  return htmlPage(
    `Unsubscribed from ${ticker}`,
    `<p>You'll no longer get signal-flip alerts for <strong>${ticker}</strong>. You can re-add it from any score page if you change your mind.</p>`
  );
}
