import { randomUUID } from "crypto";
import { query } from "@/lib/db";

// Server-only Postgres store for the newsletter list (newsletter_subscribers,
// see scripts/migrate.mjs). One row per address.

export type NewsletterStatus = "subscribed" | "unsubscribed";
export type NewsletterUnsubscribeSource = "unsubscribe_link" | "account_settings" | "staff_request";

export type NewsletterSubscriber = {
  id: string;
  email: string;
  status: NewsletterStatus;
  sourcePath?: string;
  consentText: string;
  consentAt: string;
  consentIp?: string;
  createdAt: string;
  unsubscribedAt?: string;
  unsubscribeSource?: NewsletterUnsubscribeSource;
  confirmationSentAt?: string;
};

type Row = {
  id: string;
  email: string;
  status: string;
  source_path: string | null;
  consent_text: string;
  consent_at: string;
  consent_ip: string | null;
  created_at: string;
  unsubscribed_at: string | null;
  unsubscribe_source: string | null;
  confirmation_sent_at: string | null;
};

function rowToSubscriber(row: Row): NewsletterSubscriber {
  return {
    id: row.id,
    email: row.email,
    status: row.status as NewsletterStatus,
    sourcePath: row.source_path ?? undefined,
    consentText: row.consent_text,
    consentAt: row.consent_at,
    consentIp: row.consent_ip ?? undefined,
    createdAt: row.created_at,
    unsubscribedAt: row.unsubscribed_at ?? undefined,
    unsubscribeSource: (row.unsubscribe_source as NewsletterUnsubscribeSource) ?? undefined,
    confirmationSentAt: row.confirmation_sent_at ?? undefined,
  };
}

export async function getSubscriberById(id: string): Promise<NewsletterSubscriber | null> {
  const rows = await query<Row>("SELECT * FROM newsletter_subscribers WHERE id = $1", [id]);
  return rows[0] ? rowToSubscriber(rows[0]) : null;
}

export async function getSubscriberByEmail(email: string): Promise<NewsletterSubscriber | null> {
  const rows = await query<Row>("SELECT * FROM newsletter_subscribers WHERE email = $1", [email.toLowerCase()]);
  return rows[0] ? rowToSubscriber(rows[0]) : null;
}

export async function listSubscribers(): Promise<NewsletterSubscriber[]> {
  const rows = await query<Row>("SELECT * FROM newsletter_subscribers ORDER BY created_at DESC");
  return rows.map(rowToSubscriber);
}

export type SubscribeOutcome = "new" | "resubscribed" | "already_subscribed";

// Adds the address, or reactivates it with fresh consent if it had
// unsubscribed. An address that's already subscribed is left exactly as it
// was — its original consent record stands — and no second row is ever made
// (the email column is unique, which also settles two submissions racing).
export async function addSubscriber(input: {
  email: string;
  sourcePath?: string;
  consentText: string;
  consentIp?: string;
}): Promise<{ subscriber: NewsletterSubscriber; outcome: SubscribeOutcome }> {
  const email = input.email.toLowerCase();
  const now = new Date().toISOString();
  const inserted = await query<Row>(
    `INSERT INTO newsletter_subscribers (id, email, status, source_path, consent_text, consent_at, consent_ip, created_at)
     VALUES ($1, $2, 'subscribed', $3, $4, $5, $6, $5)
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [randomUUID(), email, input.sourcePath ?? null, input.consentText, now, input.consentIp ?? null]
  );
  if (inserted[0]) return { subscriber: rowToSubscriber(inserted[0]), outcome: "new" };

  const reactivated = await query<Row>(
    `UPDATE newsletter_subscribers
        SET status = 'subscribed', source_path = $2, consent_text = $3, consent_at = $4, consent_ip = $5,
            unsubscribed_at = NULL, unsubscribe_source = NULL
      WHERE email = $1 AND status = 'unsubscribed'
      RETURNING *`,
    [email, input.sourcePath ?? null, input.consentText, now, input.consentIp ?? null]
  );
  if (reactivated[0]) return { subscriber: rowToSubscriber(reactivated[0]), outcome: "resubscribed" };

  const existing = await getSubscriberByEmail(email);
  if (!existing) throw new Error("Newsletter signup could not be saved.");
  return { subscriber: existing, outcome: "already_subscribed" };
}

// Marks the row unsubscribed — never deletes it — and returns it, or null if
// there's no such subscriber. Already unsubscribed: left as first recorded.
export async function markUnsubscribed(
  where: { id: string } | { email: string },
  source: NewsletterUnsubscribeSource
): Promise<NewsletterSubscriber | null> {
  const [column, value] = "id" in where ? ["id", where.id] : ["email", where.email.toLowerCase()];
  await query(
    `UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = $2, unsubscribe_source = $3
      WHERE ${column} = $1 AND status = 'subscribed'`,
    [value, new Date().toISOString(), source]
  );
  return "id" in where ? getSubscriberById(where.id) : getSubscriberByEmail(where.email);
}
