/**
 * Confirmation email sent when a user adds a ticker to their watchlist.
 * Sets the expectation: alerts fire when the signal flips, with a clear
 * one-click unsubscribe link in every email per CAN-SPAM and good
 * email-citizenship. Plain text + HTML side-by-side.
 */

export type WatchConfirmArgs = {
  ticker: string;
  unsubscribeUrl: string;
};

export function watchConfirmSubject(ticker: string): string {
  return `You're now watching ${ticker} on QScoring`;
}

export function watchConfirmText({ ticker, unsubscribeUrl }: WatchConfirmArgs): string {
  return [
    `You're now watching ${ticker}.`,
    "",
    `We'll email you when the QScore signal for ${ticker} changes — for example,`,
    `when it shifts from Hold to Buy Long-Term, or from Buy Short-Term to Short.`,
    `No daily noise: alerts only on genuine signal flips.`,
    "",
    `View the full ${ticker} breakdown anytime:`,
    `  https://qscoring.com/score/${ticker}`,
    "",
    "Methodology — exactly how the signal is computed:",
    "  https://qscoring.com/methodology#signals",
    "",
    "Stop watching this ticker (one click, no login):",
    `  ${unsubscribeUrl}`,
    "",
    "— QScoring",
  ].join("\n");
}

export function watchConfirmHtml({ ticker, unsubscribeUrl }: WatchConfirmArgs): string {
  const fontStack = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>You're watching ${ticker} on QScoring</title></head>
<body style="margin:0;padding:0;background:#0A0E17;color:#E8ECF1;font-family:${fontStack};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0E17;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:36px 32px;">
        <tr><td style="padding-bottom:8px;font-family:'JetBrains Mono',Consolas,monospace;color:#00D4AA;font-size:14px;letter-spacing:1px;text-transform:uppercase;">QScoring · Watchlist</td></tr>
        <tr><td style="padding-bottom:18px;">
          <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#E8ECF1;">You&rsquo;re watching ${ticker}.</h1>
        </td></tr>
        <tr><td style="padding-bottom:20px;font-size:15px;line-height:1.65;color:#B7C0CC;">
          We&rsquo;ll email you when the QScore signal for <strong style="color:#E8ECF1;">${ticker}</strong> changes &mdash; for example, when it shifts from Hold to Buy Long-Term, or from Buy Short-Term to Short. No daily noise: alerts only fire on genuine signal flips.
        </td></tr>
        <tr><td align="center" style="padding:8px 0 24px;">
          <a href="https://qscoring.com/score/${ticker}" style="display:inline-block;background:#00D4AA;color:#0A0E17;font-weight:600;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px;">View ${ticker} breakdown &rarr;</a>
        </td></tr>
        <tr><td style="padding-top:8px;font-size:14px;line-height:1.6;color:#7B8794;">
          Curious how the signal is computed? <a href="https://qscoring.com/methodology#signals" style="color:#00D4AA;text-decoration:none;">Methodology &rarr;</a>
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;line-height:1.6;color:#4A5568;">
          You can stop watching <strong>${ticker}</strong> anytime &mdash; <a href="${unsubscribeUrl}" style="color:#00D4AA;text-decoration:none;">unsubscribe with one click</a>, no login required.
        </td></tr>
        <tr><td style="padding-top:14px;font-size:12px;line-height:1.6;color:#4A5568;">
          QScoring provides quantitative analysis for informational and educational purposes only. It does not constitute investment advice.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
