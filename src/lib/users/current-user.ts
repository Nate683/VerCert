import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "./session";
import { getUserById } from "./store";
import { requiresTwoFactor } from "@/lib/two-factor/store";
import type { Customer } from "@/lib/types";

// Server-only helper for Server Components and Route Handlers.
export async function getCurrentCustomer(): Promise<Customer | null> {
  const cookieStore = await cookies();
  const session = await verifyCustomerSessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (!user) return null;
  // Every executive check in the app resolves the user through here, so this
  // is where two-factor is enforced: an executive session that didn't pass it
  // (e.g. one issued before 2FA was required) counts as signed out.
  if (requiresTwoFactor(user) && !session.twoFactorVerified) return null;
  return user;
}
