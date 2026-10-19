import type { Customer } from "@/lib/types";

// The email notifications listed on the account page and in the Client
// Dashboard Policy. Order and shipping email is transactional and always sent;
// the other two go only to accounts that turned them on. Any code that sends a
// stock or certificate email must check wantsEmail first.
//
// As of October 19, 2026 nothing sends stock or certificate emails yet, so the
// two preferences are stored and ready, and gate those sends once they exist.
export type NotificationKind = "order" | "stock" | "coa";

export function wantsEmail(user: Pick<Customer, "notifyStock" | "notifyCoa">, kind: NotificationKind): boolean {
  if (kind === "order") return true;
  return kind === "stock" ? user.notifyStock : user.notifyCoa;
}
