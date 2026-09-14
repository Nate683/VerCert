import { query } from "@/lib/db";

// Erases a customer's personal data, in one statement so it can't stop half
// done. Orders are kept for accounting but anonymized: the link to the
// account, name, email and street address go; items, lot numbers, amounts,
// dates and the state/country shipped to stay, since sales tax is reported by
// state. An unpaid order can't be fulfilled without an address, so it's
// cancelled rather than left pending.
export async function eraseCustomer(user: { id: string; email: string }): Promise<{ ordersAnonymized: number }> {
  const rows = await query<{ orders: number }>(
    `WITH anonymized AS (
       UPDATE orders
          SET customer_id = NULL,
              customer = json_build_object(
                'firstName', 'Deleted', 'lastName', 'Customer', 'email', '',
                'address', '', 'city', '', 'postalCode', '',
                'state', COALESCE(customer::jsonb->>'state', ''),
                'country', COALESCE(customer::jsonb->>'country', '')
              )::text,
              status = CASE WHEN status = 'awaiting_payment' THEN 'cancelled' ELSE status END,
              cancelled_at = CASE WHEN status = 'awaiting_payment' THEN $3 ELSE cancelled_at END,
              cancel_reason = CASE WHEN status = 'awaiting_payment' THEN 'Account deleted' ELSE cancel_reason END
        WHERE customer_id = $1 OR lower(customer::jsonb->>'email') = $2
        RETURNING id
     ), redemptions AS (
       UPDATE promo_redemptions SET customer_id = NULL WHERE customer_id = $1
     ), browsing AS (
       DELETE FROM analytics_events WHERE user_id = $1
     ), engagement AS (
       DELETE FROM email_events WHERE user_id = $1 OR recipient = $2
     ), applications AS (
       DELETE FROM affiliate_applications WHERE lower(email) = $2 AND affiliate_id IS NULL
     ), login_limits AS (
       DELETE FROM rate_limits WHERE bucket_key = 'login:account:' || $2
     ), account AS (
       DELETE FROM users WHERE id = $1
     )
     SELECT (SELECT count(*) FROM anonymized)::int AS orders`,
    [user.id, user.email.toLowerCase(), new Date().toISOString()]
  );
  return { ordersAnonymized: rows[0]?.orders ?? 0 };
}
