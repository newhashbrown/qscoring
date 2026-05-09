/**
 * Watchlist signal-change digest email. Fires once per user per day from
 * the alert cron when one or more of their watched tickers changes signal
 * since the last digest. Single email per user is the explicit UX choice
 * — sending one alert per flip would be spammy when a market regime
 * change flips many signals at once.
 *
 * Each row in the digest carries its own unsubscribe link (per-ticker
 * tokens we already store in watchlist_entries.unsubscribe_token).
 */

export type SignalChange = {
  ticker: string;
  companyName: string;
  oldSignal: string;
  newSignal: string;
  oldComposite: number | null;
  newComposite: number;
  unsubscribeUrl: string;
};

const SIGNAL_LABEL: Record<string, string> = {
  BUY_LONG_TERM: "Buy Long-Term",
  BUY_SHORT_TERM: "Buy Short-Term",
  HOLD: "Hold",
  SHORT: "Short",
};

function label(signal: string): string {
  return SIGNAL_LABEL[signal] ?? signal;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function digestSubject(changes: SignalChange[]): string {
  if (changes.length === 1) {
    const c = changes[0];
    return `${c.ticker} signal changed: ${label(c.oldSignal)} → ${label(c.newSignal)}`;
  }
  return `${changes.length} signal changes in your QScoring watchlist`;
}

export function digestText(changes: SignalChange[]): string {
  const lines: string[] = [];
  if (changes.length === 1) {
    lines.push(`A signal in your QScoring watchlist changed today.`);
  } else {
    lines.push(`${changes.length} signals in your QScoring watchlist changed today.`);
  }
  lines.push("");

  for (const c of changes) {
    lines.push(`${c.ticker} (${c.companyName})`);
    lines.push(`  ${label(c.oldSignal)} → ${label(c.newSignal)}`);
    if (c.oldComposite !== null) {
      lines.push(`  Composite ${c.oldComposite} → ${c.newComposite}`);
    } else {
      lines.push(`  Composite ${c.newComposite}`);
    }
    lines.push(`  View: https://qscoring.com/score/${c.ticker}`);
    lines.push(`  Stop watching: ${c.unsubscribeUrl}`);
    lines.push("");
  }

  lines.push("Methodology — exactly how the signal is computed:");
  lines.push("  https://qscoring.com/methodology#signals");
  lines.push("");
  lines.push("— QScoring");
  return lines.join("\n");
}

export function digestHtml(changes: SignalChange[]): string {
  const fontStack = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const monoStack = "'JetBrains Mono', Consolas, Menlo, monospace";

  const headline =
    changes.length === 1
      ? "A signal in your watchlist changed today."
      : `${changes.length} signals in your watchlist changed today.`;

  const tone = (sig: string) =>
    sig === "BUY_LONG_TERM" || sig === "BUY_SHORT_TERM"
      ? "#00D4AA"
      : sig === "SHORT"
      ? "#FF4757"
      : "#FFB800";

  const rows = changes
    .map((c) => {
      const arrow =
        c.oldComposite !== null && c.newComposite > c.oldComposite ? "▲" : c.oldComposite !== null && c.newComposite < c.oldComposite ? "▼" : "·";
      const compositeMove =
        c.oldComposite !== null
          ? `${c.oldComposite} ${arrow} ${c.newComposite}`
          : `${c.newComposite}`;
      return `
        <tr>
          <td style="padding:18px 0;border-top:1px solid rgba(255,255,255,0.06);">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding-bottom:8px;">
                  <span style="font-family:${monoStack};font-size:18px;font-weight:600;color:#E8ECF1;">${escapeHtml(c.ticker)}</span>
                  <span style="font-size:13px;color:#7B8794;margin-left:8px;">${escapeHtml(c.companyName)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:6px;font-size:14px;color:#B7C0CC;">
                  Signal:
                  <span style="color:#7B8794;">${escapeHtml(label(c.oldSignal))}</span>
                  &nbsp;→&nbsp;
                  <strong style="color:${tone(c.newSignal)};">${escapeHtml(label(c.newSignal))}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:10px;font-size:13px;color:#7B8794;font-family:${monoStack};">
                  Composite: ${escapeHtml(compositeMove)}
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;">
                  <a href="https://qscoring.com/score/${escapeHtml(c.ticker)}" style="color:#00D4AA;text-decoration:none;font-weight:500;">View ${escapeHtml(c.ticker)} breakdown →</a>
                  <span style="color:#4A5568;margin:0 10px;">·</span>
                  <a href="${escapeHtml(c.unsubscribeUrl)}" style="color:#7B8794;text-decoration:none;">Stop watching</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(digestSubject(changes))}</title></head>
<body style="margin:0;padding:0;background:#0A0E17;color:#E8ECF1;font-family:${fontStack};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0E17;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:32px 32px;">
        <tr><td style="padding-bottom:8px;font-family:${monoStack};color:#00D4AA;font-size:14px;letter-spacing:1px;text-transform:uppercase;">QScoring · Watchlist alerts</td></tr>
        <tr><td style="padding-bottom:18px;">
          <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#E8ECF1;">${escapeHtml(headline)}</h1>
        </td></tr>
        ${rows}
        <tr><td style="padding-top:24px;font-size:13px;color:#7B8794;">
          Curious how the signal is computed? <a href="https://qscoring.com/methodology#signals" style="color:#00D4AA;text-decoration:none;">Methodology &rarr;</a>
        </td></tr>
        <tr><td style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;color:#4A5568;">
          QScoring provides quantitative analysis for informational and educational purposes only. It does not constitute investment advice. The signal is the model&rsquo;s output based on factor scores; whether to act on it depends on your tax situation, time horizon, and risk tolerance.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
