import { getUserByEmail, setMarketingConsent } from "@/lib/users/store";
import { NEWSLETTER_CONSENT_TEXT } from "./consent";
import {
  addSubscriber,
  markUnsubscribed,
  type NewsletterSubscriber,
  type NewsletterUnsubscribeSource,
  type SubscribeOutcome,
} from "./store";

export {
  listSubscribers,
  getSubscriberById,
  getSubscriberByEmail,
  type NewsletterSubscriber,
  type NewsletterStatus,
  type NewsletterUnsubscribeSource,
} from "./store";
export { NEWSLETTER_CONSENT_TEXT, NEWSLETTER_DESCRIPTION, NEWSLETTER_NOTE } from "./consent";

// Runs after every successful signup. This is where a confirmation email goes
// once sending is set up: send it for "new" and "resubscribed", using
// buildNewsletterUnsubscribeUrls (lib/marketing/marketing-email.ts) for the
// unsubscribe link, and record confirmation_sent_at. Nothing is sent yet.
async function onSubscribed(subscriber: NewsletterSubscriber, outcome: SubscribeOutcome): Promise<void> {
  void subscriber;
  void outcome;
}

// The footer signup. Saves the address with its consent record, and if the
// address belongs to an account, turns that account's marketing email on too
// (as signing up from the footer always has). No account is ever created.
export async function subscribeToNewsletter(input: {
  email: string;
  sourcePath?: string;
  ip?: string;
}): Promise<SubscribeOutcome> {
  const { subscriber, outcome } = await addSubscriber({
    email: input.email,
    sourcePath: input.sourcePath,
    consentText: NEWSLETTER_CONSENT_TEXT,
    consentIp: input.ip,
  });
  if (outcome !== "already_subscribed") {
    const account = await getUserByEmail(subscriber.email);
    if (account && !account.role) await setMarketingConsent(account.id, true, "newsletter_signup");
  }
  await onSubscribed(subscriber, outcome);
  return outcome;
}

// Takes an address off the list (the row is kept, marked unsubscribed). An
// account with the same address has its marketing email turned off as well,
// so a request made either way is honoured everywhere.
export async function unsubscribeFromNewsletter(
  where: { id: string } | { email: string },
  source: NewsletterUnsubscribeSource
): Promise<NewsletterSubscriber | null> {
  const subscriber = await markUnsubscribed(where, source);
  if (subscriber) {
    const account = await getUserByEmail(subscriber.email);
    if (account?.marketingConsent) {
      await setMarketingConsent(account.id, false, source === "staff_request" ? "staff_request" : "unsubscribe_link");
    }
  }
  return subscriber;
}

// For the account side: when an account turns marketing email off (settings
// or a marketing email's unsubscribe link), the same address leaves the list.
export async function syncNewsletterOptOut(email: string, source: NewsletterUnsubscribeSource): Promise<void> {
  await markUnsubscribed({ email }, source);
}
