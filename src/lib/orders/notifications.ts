import { query } from "@/lib/db";

// Server-only. Each customer notification about an order's payment is sent AT MOST ONCE per key (Stage 3 final
// corrections): the claim is a row in the order's append-only history whose (provider, provider_event_id) pair is
// unique, so two concurrent confirmations, a retried request or a repeated provider notification can't both send it.
// The row also records, in the order's history, which message was sent and when.
//
// Keys used:
//   payment-confirmed:<order id>:<confirmed at>   "payment confirmed, your order is processing"
//   payment-hold:<order id>:<review opened at>    "payment received, completing a check before shipping"
// A hold email is never followed by a second hold email for the same review; the "confirmed" email follows a hold
// only once the hold is resolved and stock is allocated.
export async function claimNotification(orderId: string, key: string, template: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO order_events (id, order_id, order_reference, event_type, actor, source, payment_status_before, payment_status_after,
            fulfillment_status_before, fulfillment_status_after, details, provider, provider_event_id, created_at)
     SELECT gen_random_uuid()::text, o.id, o.reference, 'customer_notified', 'system:notifications', 'system', o.payment_status, o.payment_status,
            o.fulfillment_status, o.fulfillment_status, jsonb_build_object('template', $3::text), 'notification', $2, vc_now()
       FROM orders o WHERE o.id = $1
     ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [orderId, key, template]
  );
  return rows.length === 1;
}
