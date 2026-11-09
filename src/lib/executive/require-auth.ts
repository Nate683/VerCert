import { getCurrentCustomer } from "@/lib/users/current-user";

// Shared guard for the /api/executive/* routes — either realm's staff
// account (identified by the customer session's `role`) grants access to
// the same underlying data.
export async function requireExecutiveSession(): Promise<boolean> {
  const customer = await getCurrentCustomer();
  return customer?.role === "command" || customer?.role === "office";
}

// Guard for the features that were once /command-only (promotions, site
// content, announcements, affiliates management, invite codes, goals,
// subscribers, subscriptions, the activity log). Since 2026-11-08 the owner
// gave /office full parity with /command, so this now admits both realms —
// exactly like requireExecutiveSession. It is kept as a separate name so the
// routes that hold the most sensitive controls stay easy to find, and so
// narrowing them again is a one-line change here.
export async function requireCommandSession(): Promise<boolean> {
  return requireExecutiveSession();
}
