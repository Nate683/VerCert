import { signValue, verifySignature } from "@/lib/signed-token";
import { getSiteUrl } from "@/lib/site-url";
import { getUserById } from "@/lib/users/store";

// MARKETING email: product updates, restock notices, offers, campaigns —
// anything a customer could reasonably do without. Everything here:
//   - re-reads the customer and sends nothing unless marketing_consent is on
//     at the moment of sending, whatever list the caller built;
//   - appends an unsubscribe link that works signed out, and sets the
//     List-Unsubscribe headers mail clients use for their one-click button.
//
// Order, shipping, password, verification and security email is
// TRANSACTIONAL and goes through sendTransactionalEmail in lib/email.ts,
// which ignores consent entirely. Never send promotional content that way to
// get around a customer's choice here.

// The unsubscribe signature covers a purpose prefix so it can't be confused
// with any other value signed with the same secret. It never expires: an old
// email's link must keep working.
function getUnsubscribeSecret(): string {
  return process.env.SESSION_SECRET || "vericert-dev-secret-change-me";
}

const unsubscribePayload = (userId: string) => `unsubscribe:${userId}`;

export async function createUnsubscribeToken(userId: string): Promise<string> {
  return signValue(getUnsubscribeSecret(), unsubscribePayload(userId));
}

export async function verifyUnsubscribeToken(userId: string, token: string): Promise<boolean> {
  return verifySignature(getUnsubscribeSecret(), unsubscribePayload(userId), token);
}

// Links sent before the switch to user ids signed the bare email address.
export async function verifyLegacyUnsubscribeToken(email: string, token: string): Promise<boolean> {
  return verifySignature(getUnsubscribeSecret(), email.toLowerCase(), token);
}

export async function buildUnsubscribeUrls(userId: string): Promise<{ page: string; oneClick: string }> {
  const query = `u=${encodeURIComponent(userId)}&t=${await createUnsubscribeToken(userId)}`;
  const siteUrl = getSiteUrl();
  return { page: `${siteUrl}/unsubscribe?${query}`, oneClick: `${siteUrl}/api/unsubscribe?${query}` };
}

type ResendPayload = { to: string; subject: string; text: string; headers?: Record<string, string> };

// Falls back to a console log if RESEND_API_KEY isn't configured yet, so the
// compose flow still works end-to-end in dev.
async function postToResend({ to, subject, text, headers }: ResendPayload): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.MARKETING_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "VeriCert Research <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[marketing-email:dev-fallback] RESEND_API_KEY not set. Would have sent to ${to}:\nSubject: ${subject}\n\n${text}`);
    return { ok: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, ...(headers ? { headers } : {}) }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Resend API error (${res.status}): ${body}` };
  }
  return { ok: true };
}

export type MarketingSendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "unknown customer" | "no marketing consent" }
  | { status: "failed"; error: string };

export async function sendMarketingEmail(
  userId: string,
  { subject, text }: { subject: string; text: string }
): Promise<MarketingSendResult> {
  const user = await getUserById(userId);
  if (!user) return { status: "skipped", reason: "unknown customer" };
  if (!user.marketingConsent) return { status: "skipped", reason: "no marketing consent" };

  const unsubscribe = await buildUnsubscribeUrls(user.id);
  const result = await postToResend({
    to: user.email,
    subject,
    text: `${text}\n\n---\nYou're receiving this because you opted in to VeriCert product updates.\nUnsubscribe: ${unsubscribe.page}`,
    headers: {
      "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return result.ok ? { status: "sent" } : { status: "failed", error: result.error ?? "Unknown error" };
}

// Announcements to active affiliates. They're business partners emailed at
// their business address under the affiliate agreement, not consumers on a
// marketing list, so there's no consent check or unsubscribe footer. Don't
// use this for anything aimed at customers.
export async function sendAffiliateAnnouncement(input: { to: string; subject: string; text: string }) {
  return postToResend(input);
}
