import type { Order } from "@/lib/types";
import { methodLabel } from "@/lib/payments/methods";

// Stage 3: what an awaiting-payment order shows for a method other than bank transfer or the retired Coinbase crypto.
// - Zelle: the business recipient (only if configured — never invented), the amount and the reference to include.
//   Stock isn't held: the order is confirmed once a person has verified the payment.
// - Provider methods (crypto, ACH, cards, wallets): no provider is connected, so there is nothing to pay with yet;
//   the panel says so plainly rather than showing any address or form.
export function PendingPaymentPanel({ order, zelle, simulated }: { order: Order; zelle: { name: string; handle: string; isConfigured: boolean }; simulated: boolean }) {
  const label = methodLabel(order.paymentMethod);
  const expired = order.paymentStatus === "expired";
  return (
    <section className="border border-hairline p-6 sm:p-8" data-pending-panel={order.paymentMethod}>
      <p className="text-xs uppercase tracking-[0.25em] text-gold-ink">{label}</p>
      {expired ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          The time to pay for this order ran out and the items it held were released. Please don&apos;t send a payment for it.
        </p>
      ) : order.paymentStatus === "failed" ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">The payment for this order didn&apos;t go through.</p>
      ) : order.paymentMethod === "zelle" ? (
        zelle.isConfigured ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            <p>
              Send <span className="text-navy">${order.total.toFixed(2)}</span> with Zelle to{" "}
              <span className="text-navy">{zelle.name}</span> (<span className="text-navy">{zelle.handle}</span>), and put your order
              reference <span className="font-mono text-navy">{order.reference}</span> in the memo.
            </p>
            <p>Your items aren&apos;t held until we&apos;ve verified the payment. We&apos;ll email you as soon as it&apos;s confirmed.</p>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-muted">Zelle payment details aren&apos;t available right now. Please don&apos;t send a payment yet.</p>
        )
      ) : (
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
          {order.paymentStatus === "processing" ? (
            <p>Your payment is processing. We&apos;ll email you when it has settled.</p>
          ) : (
            <p>No payment provider is connected for {label} yet, so there is nothing to pay with. Please don&apos;t send a payment for this order.</p>
          )}
          {order.reservationExpiresAt && order.fulfillmentStatus === "reserved" && (
            <p>Your items are held until {new Date(order.reservationExpiresAt).toLocaleString()}.</p>
          )}
          {simulated && <p className="text-xs uppercase tracking-[0.14em] text-red-700">Local simulation — not a real payment.</p>}
        </div>
      )}
    </section>
  );
}
