// One-off script to verify Resend is configured correctly end to end.
// Usage: node --env-file=.env.local scripts/test-email.mjs you@example.com
import "dotenv/config";

const to = process.argv[2];
if (!to) {
  console.error("Usage: node --env-file=.env.local scripts/test-email.mjs you@example.com");
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY?.trim();
if (!apiKey) {
  console.error("[test-email] RESEND_API_KEY is not set in .env.local — nothing to test yet.");
  process.exit(1);
}

const from = process.env.EMAIL_FROM?.trim() || "VeriCert Research <onboarding@resend.dev>";

const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:32px;background:#000;font-family:Arial,sans-serif;color:#fff;">
  <div style="max-width:480px;margin:0 auto;text-align:center;">
    <div style="font-family:Georgia,serif;font-size:22px;letter-spacing:4px;color:#c9a227;text-transform:uppercase;">VeriCert</div>
    <p style="margin-top:24px;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.85);">
      This is a test email confirming Resend is configured correctly.<br />
      Sent from: <strong>${from}</strong>
    </p>
  </div>
</body></html>`;

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to,
    subject: "VeriCert — Resend Test Email",
    text: `This is a test email confirming Resend is configured correctly.\nSent from: ${from}`,
    html,
  }),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`[test-email] Resend API error (${res.status}):`, body);
  process.exit(1);
}

const data = await res.json();
console.log(`[test-email] Sent successfully. Resend message id: ${data.id}`);
console.log(`[test-email] Check the inbox for ${to} (and your spam folder the first time).`);
