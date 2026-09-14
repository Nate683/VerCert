import { createHmac, timingSafeEqual } from "crypto";
import { query } from "@/lib/db";

// Email engagement from Resend. Resend delivers events through Svix-signed
// webhooks; opens and clicks only arrive once open and click tracking are
// switched on for the sending domain in the Resend dashboard.
const TOLERANCE_SECONDS = 5 * 60;
const RECORDED_EVENTS = new Set(["email.opened", "email.clicked", "email.bounced", "email.complained"]);

// Svix scheme: base64 HMAC-SHA256 of "<id>.<timestamp>.<raw body>", keyed with
// the base64 part of the whsec_ secret. The header may carry several
// space-separated "v1,<signature>" entries while a secret is being rotated.
export function verifyResendSignature(rawBody: string, headers: Headers, secret: string, nowMs = Date.now()): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowMs / 1000 - sentAt) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64"));
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    click?: { link?: string };
  };
};

// Stores one delivery, keyed on the Svix message id so a redelivered webhook
// is recorded once. A spam complaint also switches off marketing email for
// that address — we shouldn't need a second complaint to get the hint.
export async function recordResendEvent(messageId: string, event: ResendWebhookEvent): Promise<void> {
  if (!RECORDED_EVENTS.has(event.type)) return;
  const to = event.data?.to;
  const recipient = (Array.isArray(to) ? to[0] : to)?.trim().toLowerCase() ?? null;

  await query(
    `INSERT INTO email_events (id, resend_email_id, event_type, recipient, subject, link, user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM users WHERE email = $4), $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      messageId,
      event.data?.email_id ?? null,
      event.type,
      recipient,
      event.data?.subject?.slice(0, 300) ?? null,
      event.data?.click?.link?.slice(0, 2000) ?? null,
      event.created_at ?? new Date().toISOString(),
    ]
  );

  if (event.type === "email.complained" && recipient) {
    await query("UPDATE users SET marketing_opt_in = FALSE WHERE email = $1", [recipient]);
  }
}
