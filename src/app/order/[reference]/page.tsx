import { notFound } from "next/navigation";
import { getOrderByReference } from "@/lib/orders/store";
import { getBankTransferDetails } from "@/lib/bank-details";
import { CryptoPaymentPanel } from "./CryptoPaymentPanel";
import { BankTransferPanel } from "./BankTransferPanel";
import { OrderStatusTimeline } from "./OrderStatusTimeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Order | VeriCert", robots: { index: false, follow: false } };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const order = await getOrderByReference(reference);
  if (!order) notFound();

  // Only awaiting_payment/expired orders need the interactive payment
  // panels — everything past that point (paid through delivered, or
  // cancelled) gets the status timeline instead. This is a fresh server
  // read every time, so it survives a refresh or a closed browser.
  const isPending = order.status === "awaiting_payment" || order.status === "expired";

  return (
    <div className="mx-auto max-w-4xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Order {order.reference}</p>
      <h1 className="mt-3 font-serif text-4xl text-white">
        {isPending ? "Complete Your Payment" : "Order Confirmed"}
      </h1>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {isPending ? (
            order.paymentMethod === "crypto" && order.crypto ? (
              <CryptoPaymentPanel
                reference={order.reference}
                crypto={order.crypto}
                initialStatus={order.status}
              />
            ) : (
              <BankTransferPanel
                reference={order.reference}
                total={order.total}
                initialStatus={order.status}
                bankDetails={getBankTransferDetails()}
              />
            )
          ) : (
            <OrderStatusTimeline order={order} />
          )}
        </div>

        <aside className="border border-white/10 p-6 lg:col-span-2">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Order Summary</h2>
          <ul className="mt-4 space-y-4">
            {order.items.map((item) => (
              <li key={`${item.slug}-${item.sizeLabel}`} className="flex justify-between text-sm">
                <div>
                  <p className="text-white">{item.name}</p>
                  <p className="text-xs text-white/40">
                    {item.sizeLabel} × {item.quantity}
                  </p>
                </div>
                <span className="text-white">${(item.priceUsd * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-white/10 pt-4 text-sm">
            {order.discountAmount ? (
              <>
                <div className="flex justify-between text-white/60">
                  <span>Subtotal</span>
                  <span>${order.subtotal.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex justify-between text-white/60">
                  <span>Discount{order.promoCode ? ` (${order.promoCode})` : ""}</span>
                  <span className="text-gold">-${order.discountAmount.toFixed(2)}</span>
                </div>
              </>
            ) : order.freeShipping ? (
              <div className="flex justify-between text-white/60">
                <span>Shipping</span>
                <span className="text-gold">Free ({order.promoCode})</span>
              </div>
            ) : null}
          </div>
          <div className="flex justify-between border-t border-white/10 pt-4 font-serif text-lg">
            <span className="text-white">Total</span>
            <span className="text-gold">${order.total.toFixed(2)}</span>
          </div>

          <div className="mt-6 border-t border-white/10 pt-4 text-xs text-white/40">
            <p>{order.customer.firstName} {order.customer.lastName}</p>
            <p>{order.customer.address}</p>
            <p>
              {order.customer.city}, {order.customer.state} {order.customer.postalCode}
            </p>
            <p>{order.customer.country}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
