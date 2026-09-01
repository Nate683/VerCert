import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByReference } from "@/lib/orders/store";
import { getBankTransferDetails } from "@/lib/bank-details";
import { getContent, DEFAULT_CONTACT } from "@/lib/site-content";
import { CryptoPaymentPanel } from "./CryptoPaymentPanel";
import { BankTransferPanel } from "./BankTransferPanel";
import { OrderStatusTimeline } from "./OrderStatusTimeline";
import { CopyReference } from "./CopyReference";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Order | VeriCert", robots: { index: false, follow: false } };

function isUnset(value: string): boolean {
  return value.includes("edit in EXEC MODE");
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const [order, contact] = await Promise.all([
    getOrderByReference(reference),
    getContent("contact_page", DEFAULT_CONTACT),
  ]);
  if (!order) notFound();

  // Only awaiting_payment/expired orders need the interactive payment
  // panels — everything past that point (paid through delivered, or
  // cancelled) gets the status timeline instead. This is a fresh server
  // read every time, so it survives a refresh or a closed browser.
  const isPending = order.status === "awaiting_payment" || order.status === "expired";
  const supportEmail = !isUnset(contact.email) ? contact.email : null;

  const nextSteps = isPending
    ? [
        "Complete payment using the panel on this page.",
        "We confirm receipt and email you — usually within the hour.",
        "Your order ships in discreet packaging within 1–2 business days.",
      ]
    : [
        "A confirmation has been emailed to " + order.customer.email + ".",
        "We pack and dispatch within 1–2 business days.",
        "Tracking appears on this page and in your account as soon as it ships.",
      ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">
        {isPending ? "Payment Required" : "Order Confirmed"}
      </p>
      <h1 className="mt-3 font-serif text-4xl text-navy">
        {isPending ? "Complete Your Payment" : "Thank you — your order is in."}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>Reference</span>
        <CopyReference reference={order.reference} />
        <span className="hidden sm:inline">·</span>
        <span>
          Placed{" "}
          {new Date(order.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-5">
        <div className="space-y-8 lg:col-span-3">
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

          <section className="border border-hairline p-6">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">What Happens Next</h2>
            <ol className="mt-4 space-y-3">
              {nextSteps.map((stepText, i) => (
                <li key={stepText} className="flex gap-3 text-sm leading-relaxed text-muted">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-gold/40 text-[10px] text-gold-ink">
                    {i + 1}
                  </span>
                  {stepText}
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-3 border-t border-hairline pt-5 text-xs uppercase tracking-[0.14em]">
              <Link href="/account" className="text-muted transition-colors hover:text-gold-ink">
                Order history →
              </Link>
              <Link href="/shop" className="text-muted transition-colors hover:text-gold-ink">
                Continue shopping →
              </Link>
              {supportEmail ? (
                <a
                  href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Order ${order.reference}`)}`}
                  className="text-muted transition-colors hover:text-gold-ink"
                >
                  Email us about this order →
                </a>
              ) : (
                <Link href="/contact" className="text-muted transition-colors hover:text-gold-ink">
                  Contact support →
                </Link>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:col-span-2">
          <div className="border border-hairline p-6">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Order Summary</h2>
            <ul className="mt-4 space-y-4">
              {order.items.map((item) => (
                <li key={`${item.slug}-${item.sizeLabel}`} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <Link
                      href={`/shop/${item.slug}`}
                      className="block truncate text-navy transition-colors hover:text-gold-ink"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {item.sizeLabel} × {item.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-navy">
                    ${(item.priceUsd * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-6 space-y-2 border-t border-hairline pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-mono text-navy">${order.subtotal.toFixed(2)}</dd>
              </div>
              {order.discountAmount ? (
                <div className="flex justify-between">
                  <dt className="text-muted">
                    Discount{order.promoCode ? ` (${order.promoCode})` : ""}
                  </dt>
                  <dd className="font-mono text-gold-ink">−${order.discountAmount.toFixed(2)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="text-muted">
                  {order.freeShipping ? `Free${order.promoCode ? ` (${order.promoCode})` : ""}` : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex items-baseline justify-between border-t border-hairline pt-4 font-serif text-lg">
              <span className="text-navy">Total</span>
              <span className="font-mono text-gold-ink">${order.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="border border-hairline p-6">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Shipping To</h2>
            <address className="mt-4 text-sm not-italic leading-relaxed text-muted">
              <span className="block text-navy">
                {order.customer.firstName} {order.customer.lastName}
              </span>
              {order.customer.address}
              <br />
              {order.customer.city}, {order.customer.state} {order.customer.postalCode}
              <br />
              {order.customer.country}
            </address>
            <p className="mt-4 border-t border-hairline pt-4 text-xs text-muted">
              {order.customer.email}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
