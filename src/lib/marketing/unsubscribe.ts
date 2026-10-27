import { getUserByEmail, getUserById, setMarketingConsent } from "@/lib/users/store";
import {
  verifyLegacyUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./marketing-email";
import { syncNewsletterOptOut, unsubscribeFromNewsletter } from "@/lib/newsletter";

export type UnsubscribeParams = {
  u?: string | null;
  s?: string | null;
  t?: string | null;
  email?: string | null;
  token?: string | null;
};

// Turns marketing consent off for whoever the signed link names. No sign-in:
// the signature is the proof. Returns the address that was unsubscribed, or
// null for a link that doesn't verify or names no account.
export async function unsubscribeFromLink(params: UnsubscribeParams): Promise<string | null> {
  let userId: string | undefined;
  if (params.u && params.t && (await verifyUnsubscribeToken(params.u, params.t))) {
    userId = params.u;
  } else if (params.email && params.token && (await verifyLegacyUnsubscribeToken(params.email, params.token))) {
    userId = (await getUserByEmail(params.email))?.id;
  }
  if (!userId || !(await getUserById(userId))) return null;

  const user = await setMarketingConsent(userId, false, "unsubscribe_link");
  if (user) await syncNewsletterOptOut(user.email, "unsubscribe_link");
  return user?.email ?? null;
}

// The newsletter's own link (?s=subscriber&t=signature). Marks the
// subscriber unsubscribed, keeping the row as the record. Returns the address,
// or null for a link that doesn't verify or names no subscriber.
export async function unsubscribeNewsletterFromLink(params: UnsubscribeParams): Promise<string | null> {
  if (!params.s || !params.t || !(await verifyNewsletterUnsubscribeToken(params.s, params.t))) return null;
  const subscriber = await unsubscribeFromNewsletter({ id: params.s }, "unsubscribe_link");
  return subscriber?.email ?? null;
}
