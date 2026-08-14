import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "./session";
import { getUserById } from "./store";
import type { Customer } from "@/lib/types";

// Server-only helper for Server Components and Route Handlers.
export async function getCurrentCustomer(): Promise<Customer | null> {
  const cookieStore = await cookies();
  const userId = await verifyCustomerSessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!userId) return null;
  return getUserById(userId);
}
