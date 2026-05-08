/**
 * Admin notification email — fired alongside the welcome email whenever a
 * fresh subscriber lands in the D1 subscribers table. Distinct from the
 * welcome email so the operator inbox stays focused on signal (new lead +
 * meta) rather than a copy of the user-facing welcome.
 */

export type AdminNotifyArgs = {
  email: string;
  source: string;
  country: string | null;
  ipHash: string | null;
  userAgent: string;
  totalCount: number | null;
};

export function adminNotifySubject(email: string): string {
  return `New QScoring signup: ${email}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function adminNotifyText(args: AdminNotifyArgs): string {
  const lines = [
    "New QScoring waitlist signup.",
    "",
    `Email:      ${args.email}`,
    `Source:     ${args.source}`,
    `Country:    ${args.country ?? "(unknown)"}`,
    `Total:      ${args.totalCount === null ? "(query failed)" : `signup #${args.totalCount}`}`,
    `IP hash:    ${args.ipHash ?? "(none)"}`,
    `User agent: ${args.userAgent || "(none)"}`,
    `Timestamp:  ${new Date().toISOString()}`,
    "",
    "Cloudflare D1 row already inserted. Resend dashboard:",
    "  https://resend.com/emails",
  ];
  return lines.join("\n");
}

export function adminNotifyHtml(args: AdminNotifyArgs): string {
  const fontStack = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const monoStack = "'JetBrains Mono', Consolas, Menlo, monospace";

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:6px 12px 6px 0;color:#7B8794;font-size:13px;font-family:${fontStack};white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:#E8ECF1;font-size:13px;font-family:${monoStack};word-break:break-all;">${escapeHtml(value)}</td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(adminNotifySubject(args.email))}</title></head>
<body style="margin:0;padding:0;background:#0A0E17;color:#E8ECF1;font-family:${fontStack};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0E17;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:28px 28px;">
        <tr><td style="padding-bottom:6px;font-family:${monoStack};color:#00D4AA;font-size:12px;letter-spacing:1px;text-transform:uppercase;">QScoring · Admin notify</td></tr>
        <tr><td style="padding-bottom:18px;"><h1 style="margin:0;font-size:20px;font-weight:700;color:#E8ECF1;">New waitlist signup</h1></td></tr>
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            ${row("Email", args.email)}
            ${row("Source", args.source)}
            ${row("Country", args.country ?? "(unknown)")}
            ${row("Total", args.totalCount === null ? "(query failed)" : `signup #${args.totalCount}`)}
            ${row("IP hash", args.ipHash ?? "(none)")}
            ${row("User agent", args.userAgent || "(none)")}
            ${row("Timestamp", new Date().toISOString())}
          </table>
        </td></tr>
        <tr><td style="padding-top:22px;font-size:12px;color:#4A5568;font-family:${fontStack};">
          Resend dashboard: <a href="https://resend.com/emails" style="color:#00D4AA;text-decoration:none;">resend.com/emails</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
