/**
 * Welcome email sent to fresh waitlist signups. Reinforces the
 * founding-member pricing pledge and gives a one-click path back to use
 * the product immediately.
 *
 * Plain text + HTML are kept side-by-side so dark-mode mail clients and
 * privacy-mode (text-only) readers both render correctly.
 */

export const WELCOME_SUBJECT = "Welcome to the QScoring waitlist — try it now";

export function welcomeText(): string {
  return [
    "Welcome to QScoring.",
    "",
    "You're on the waitlist. We're heads-down validating the QScore against",
    "real backtest data right now — we won't turn on subscription billing",
    "until that page is filled in with real Sharpe and information-coefficient",
    "numbers. You'll be the first to hear when it's ready.",
    "",
    "Founding-member perk: anyone on the list before launch locks in",
    "$14.99/month for life — 25% off the standard $19.99 rate. We won't",
    "back-fill this for late signups.",
    "",
    "While you wait, the product is fully usable for free. Type any US ticker:",
    "",
    "  https://qscoring.com/score",
    "",
    "Examples — https://qscoring.com/score/AAPL or just /score/Apple.",
    "",
    "Read the full methodology at https://qscoring.com/methodology.",
    "",
    "— QScoring",
  ].join("\n");
}

export function welcomeHtml(): string {
  // Inline styles only — most mail clients strip <style> blocks.
  const fontStack = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Welcome to QScoring</title>
</head>
<body style="margin:0;padding:0;background:#0A0E17;color:#E8ECF1;font-family:${fontStack};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0E17;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:36px 32px;">
          <tr>
            <td style="padding-bottom:8px;font-family:'JetBrains Mono',Consolas,monospace;color:#00D4AA;font-size:14px;letter-spacing:1px;text-transform:uppercase;">QScoring.com</td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;">
              <h1 style="margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px;color:#E8ECF1;">You&rsquo;re on the list.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;font-size:15px;line-height:1.65;color:#B7C0CC;">
              We&rsquo;re heads-down validating the QScore against real backtest data right now. We won&rsquo;t turn on subscription billing until our methodology page is filled in with actual Sharpe and information-coefficient numbers &mdash; you&rsquo;ll be the first to hear when it&rsquo;s ready.
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px;background:rgba(0,212,170,0.08);border-left:3px solid #00D4AA;border-radius:8px;font-size:14px;line-height:1.6;color:#E8ECF1;">
              <strong style="color:#00D4AA;">Founding-member perk.</strong> Anyone on the list before launch locks in <strong>$14.99/month for life</strong> &mdash; 25% off the standard $19.99 rate. We won&rsquo;t back-fill this for late signups.
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;font-size:15px;line-height:1.65;color:#B7C0CC;">
              While you wait, the product is fully usable for free. Type any US ticker or company name:
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 0;">
              <a href="https://qscoring.com/score" style="display:inline-block;background:#00D4AA;color:#0A0E17;font-weight:600;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px;">Try a Score &rarr;</a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:8px;font-size:14px;line-height:1.6;color:#7B8794;">
              Examples: <a href="https://qscoring.com/score/AAPL" style="color:#00D4AA;text-decoration:none;">AAPL</a>, <a href="https://qscoring.com/score/NVDA" style="color:#00D4AA;text-decoration:none;">NVDA</a>, or just <a href="https://qscoring.com/score/Tesla" style="color:#00D4AA;text-decoration:none;">/score/Tesla</a>.
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;font-size:14px;line-height:1.6;color:#7B8794;">
              Curious how it&rsquo;s calculated? <a href="https://qscoring.com/methodology" style="color:#00D4AA;text-decoration:none;">Full methodology &rarr;</a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:32px;border-top:1px solid rgba(255,255,255,0.06);margin-top:32px;font-size:12px;line-height:1.6;color:#4A5568;">
              QScoring provides quantitative analysis for informational and educational purposes only. It does not constitute investment advice. Past performance does not guarantee future results.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
