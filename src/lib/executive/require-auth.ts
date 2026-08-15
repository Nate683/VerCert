import { getCurrentCustomer } from "@/lib/users/current-user";

// Shared guard for the /api/executive/* routes — either realm's staff
// account (identified by the customer session's `role`) grants access to
// the same underlying data.
export async function requireExecutiveSession(): Promise<boolean> {
  const customer = await getCurrentCustomer();
  return customer?.role === "command" || customer?.role === "office";
}

// Stricter guard for /command-only features (promotions, site content) that
// /office must never be able to read or write, even by calling the API directly.
export async function requireCommandSession(): Promise<boolean> {
  const customer = await getCurrentCustomer();
  return customer?.role === "command";
}
