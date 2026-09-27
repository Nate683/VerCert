import { getUserByEmail, getUserById, setMarketingConsent } from "@/lib/users/store";
import { verifyLegacyUnsubscribeToken, verifyUnsubscribeToken } from "./marketing-email";

export type UnsubscribeParams = { u?: string | null; t?: string | null; email?: string | null; token?: string | null };

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
  return user?.email ?? null;
}
