import { signValue, verifySignature } from "@/lib/signed-token";

function getUnsubscribeSecret(): string {
  return process.env.SESSION_SECRET || "vericert-dev-secret-change-me";
}

export async function createUnsubscribeToken(email: string): Promise<string> {
  return signValue(getUnsubscribeSecret(), email.toLowerCase());
}

export async function verifyUnsubscribeToken(email: string, token: string): Promise<boolean> {
  return verifySignature(getUnsubscribeSecret(), email.toLowerCase(), token);
}

export type SendMarketingEmailInput = {
  to: string;
  subject: string;
  text: string;
};

// Sends via the Resend API. Falls back to a console log if RESEND_API_KEY
// isn't configured yet, so the compose flow still works end-to-end in dev.
export async function sendMarketingEmail({
  to,
  subject,
  text,
}: SendMarketingEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.MARKETING_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "VeriCert Research <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[resend:dev-fallback] RESEND_API_KEY not set. Would have sent to ${to}:\nSubject: ${subject}\n\n${text}`);
    return { ok: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Resend API error (${res.status}): ${body}` };
  }

  return { ok: true };
}
