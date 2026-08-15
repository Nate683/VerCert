// Wraps every transactional email in a consistent black-and-gold branded
// HTML shell matching the storefront. Plain-text bodies are auto-linkified
// and line-break-preserved, so existing call sites don't need their own HTML.
const GOLD = "#c9a227";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkifyAndBreak(text: string): string {
  const escaped = escapeHtml(text);
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s]+)/g,
    (url) => `<a href="${url}" style="color:${GOLD};text-decoration:underline;">${url}</a>`
  );
  return withLinks.replace(/\n/g, "<br />");
}

// The shared shell: wordmark header, body content, disclaimer footer.
export function renderEmailShell(subject: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:28px;text-align:center;border-bottom:1px solid rgba(201,162,39,0.25);">
                <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:4px;color:${GOLD};text-transform:uppercase;">VeriCert</span>
                <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-top:6px;">Research Peptides</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.85);">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;border-top:1px solid rgba(255,255,255,0.1);font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:rgba(255,255,255,0.35);">
                For research use only. Not for human or veterinary use.<br />
                &copy; ${new Date().getFullYear()} VeriCert Research. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Auto-generates HTML from a plain-text body — used for every email that
// only has a text template today (verification, reset, order emails, etc.)
// so they get full branding with zero changes to their call sites.
export function renderEmailHtml(subject: string, bodyText: string): string {
  return renderEmailShell(subject, linkifyAndBreak(bodyText));
}

// A highlighted gold callout box — used for order references, affiliate
// portal codes, etc. so they stand out from the surrounding body copy.
export function renderCalloutBox(label: string, value: string): string {
  return `<div style="margin:20px 0;padding:16px;border:1px solid rgba(201,162,39,0.4);background-color:rgba(201,162,39,0.05);text-align:center;">
  <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.4);">${escapeHtml(label)}</div>
  <div style="font-family:'Courier New',monospace;font-size:22px;letter-spacing:2px;color:${GOLD};margin-top:6px;">${escapeHtml(value)}</div>
</div>`;
}

export function renderButton(label: string, href: string): string {
  return `<div style="margin:24px 0;text-align:center;">
  <a href="${href}" style="display:inline-block;padding:12px 28px;border:1px solid ${GOLD};color:${GOLD};text-decoration:none;font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(label)}</a>
</div>`;
}

export { escapeHtml };
