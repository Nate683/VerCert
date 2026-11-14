import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CUSTOMER_SESSION_COOKIE, sessionSignedInAt, verifyCustomerSessionToken } from "./session";
import { getUserById } from "./store";
import { requiresTwoFactor } from "@/lib/two-factor/store";
import type { Customer } from "@/lib/types";

// Server-only helper for Server Components and Route Handlers.
//
// Wrapped in React's cache(), so within one server render the root layout
// (which always asks) and a page that gates on it share a single lookup.
// Route handlers aren't rendered by React, so each call there still runs.
export const getCurrentCustomer = cache(async (): Promise<Customer | null> => {
  const cookieStore = await cookies();
  const session = await verifyCustomerSessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (!user) return null;
  // Every executive check in the app resolves the user through here, so this
  // is where two-factor is enforced: an executive session that didn't pass it
  // (e.g. one issued before 2FA was required) counts as signed out.
  if (requiresTwoFactor(user) && !session.twoFactorVerified) return null;
  // After a password change or reset, sessions that signed in before it count
  // as signed out (every account page and API resolves the user through here).
  if (user.sessionsValidAfter && sessionSignedInAt(session) < Date.parse(user.sessionsValidAfter)) return null;
  return user;
});

// For the signed-in-only storefront pages (shop, product pages, cart). The
// proxy only checks a cookie's signature (no database on that path), so a
// session signed out by a password change or reset still gets past it; this
// is the authoritative check. It sends such a session exactly where the proxy
// sends a visitor with no session: /register?next=<this page>.
export async function requireCustomerForPage(nextPath: string): Promise<Customer> {
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/register?${new URLSearchParams({ next: nextPath })}`);
  return customer;
}
