import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { ORDER_ACCESS_COOKIE, referencesFromCookie } from "@/lib/orders/guest-access";
import { getOrderByReference } from "@/lib/orders/store";
import { getBankTransferDetails } from "@/lib/bank-details";
import { getContent, DEFAULT_CONTACT } from "@/lib/site-content";
import { CryptoPaymentPanel } from "./CryptoPaymentPanel";
import { BankTransferPanel } from "./BankTransferPanel";
import { OrderStatusTimeline } from "./OrderStatusTimeline";
import { CopyReference } from "./CopyReference";
import { PendingPaymentPanel } from "./PendingPaymentPanel";
import { isPaymentSimulation, zelleDetails } from "@/lib/payments/config";
import { getFulfilledLots } from "@/lib/orders/lots";
import { isFullyRefunded } from "@/lib/orders/revenue";

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
  const [order, contact, viewer, jar] = await Promise.all([
    getOrderByReference(reference),
    getContent("contact_page", DEFAULT_CONTACT),
    getCurrentCustomer(),
    cookies(),
  ]);

  // An order shows its buyer's name, email and address, so only that buyer
  // (signed in, or after matching reference + email at /order-status) and
  // staff may see it. Anyone else gets the same answer as for a missing
  // order, so a reference can't be probed.
  const guestRefs = await referencesFromCookie(jar.get(ORDER_ACCESS_COOKIE)?.value);
  const allowed =
    order &&
    ((viewer && (viewer.id === order.customerId || viewer.role === "command" || viewer.role === "office")) ||
      guestRefs.includes(order.reference));
  if (!allowed) {
    if (!viewer) redirect(`/order-status?reference=${encodeURIComponent(reference.toUpperCase())}`);
    notFound();
  }

  // Only awaiting_payment/expired orders need the interactive payment
  // panels — everything past that point (paid through delivered, or
  // cancelled) gets the status timeline instead. This is a fresh server
  // read every time, so it survives a refresh or a closed browser.
  const isPending = order.status === "awaiting_payment" || order.status === "expired" || order.status === "payment_failed";
  // Stage 3 methods get their own panel; bank transfer and the retired Coinbase crypto keep theirs.
  const stage3Panel = isPending && order.paymentMethod !== "bank_transfer" && order.paymentMethod !== "crypto";
  const supportEmail = !isUnset(contact.email) ? contact.email : null;
  // A crypto order whose charge was never created (the provider failed at
  // checkout): no address or payment window exists, so it must not be shown
  // the bank-transfer instructions it used to fall through to.
  const cryptoNotSetUp = isPending && order.paymentMethod === "crypto" && !order.crypto;

  // Stage 3 final corrections: payment is recorded but the order is held in Administrative Review before fulfillment.
  // DRAFT COPY — PENDING OWNER APPROVAL. Never shows the internal review reason.
  const onHold =
    Boolean(order.needsReview) && (order.paymentStatus === "confirmed" || order.paymentStatus === "partially_refunded") &&
    !["shipped", "delivered", "returned", "cancelled"].includes(order.fulfillmentStatus ?? "");
  // The lots each line was ACTUALLY filled from (allocated stock) — never the line's stored lotNumber, which was an
  // assumption made at checkout before Stage 3. Nothing is shown until stock is allocated.
  const fulfilledLots = await getFulfilledLots(order.id);

  // Status only: no payment is arranged outside checkout.
  const nextSteps = onHold
    ? [
        "We've received your payment for this order.",
        "Before it ships, we're completing a final check. There's nothing you need to do.",
        "We'll email you as soon as it's on its way, or contact you directly if anything about your order needs to change.",
      ]
    : cryptoNotSetUp
    ? ["No crypto payment address was issued, so please don't send cryptocurrency for this order."]
    : isPending
    ? [
        "Complete payment using the panel on this page.",
        "We confirm receipt and email you — usually within the hour.",
        "Your order ships with tracking within 1–2 business days.",
      ]
    : [
        "A confirmation has been emailed to " + order.customer.email + ".",
        "We pack and dispatch within 1–2 business days.",
        "Tracking appears on this page and in your account as soon as it ships.",
      ];

  // The heading follows the order's state: a cancelled or refunded order must
  // not open with "Thank you — your order is in."
  const heading = cryptoNotSetUp
    ? { eyebrow: "Payment Not Set Up", title: "We couldn't set up crypto payment" }
    : isPending
    ? {
        eyebrow: order.paymentMethod === "bank_transfer" ? "Bank Transfer — Awaiting Settlement" : "Payment Required",
        title: "Complete Your Payment",
      }
    : isFullyRefunded(order)
      ? { eyebrow: "Order Refunded", title: "This order was refunded." }
      : onHold
      ? { eyebrow: "Payment Received", title: "We're completing a final check before shipping." }
      : order.status === "cancelled"
        ? { eyebrow: "Order Cancelled", title: "This order was cancelled." }
        : order.status === "delivered"
          ? { eyebrow: "Order Delivered", title: "Your order has been delivered." }
          : order.status === "shipped"
            ? { eyebrow: "Order Shipped", title: "Your order is on its way." }
            : { eyebrow: "Order Confirmed", title: "Thank you — your order is in." };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">{heading.eyebrow}</p>
      <h1 className="mt-3 font-serif text-4xl text-navy">{heading.title}</h1>
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
          {cryptoNotSetUp ? (
            <section className="border border-hairline p-6 sm:p-8">
              <p className="text-xs uppercase tracking-[0.25em] text-gold-ink">Cryptocurrency</p>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Crypto payment couldn&apos;t be set up for this order, so no payment address or window was
                issued. Please don&apos;t send cryptocurrency for it.
              </p>
            </section>
          ) : stage3Panel ? (
            <PendingPaymentPanel order={order} zelle={zelleDetails()} simulated={isPaymentSimulation()} />
          ) : isPending ? (
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
            <div className="mt-4 flex flex-wrap gap-x-5 border-t border-hairline pt-3 text-xs uppercase tracking-[0.14em]">
              {viewer && (
                <Link href="/account" className="inline-block py-2.5 text-muted transition-colors hover:text-gold-ink">
                  Order history →
                </Link>
              )}
              <Link href="/shop" className="inline-block py-2.5 text-muted transition-colors hover:text-gold-ink">
                Continue shopping →
              </Link>
              {supportEmail ? (
                <a
                  href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Order ${order.reference}`)}`}
                  className="inline-block py-2.5 text-muted transition-colors hover:text-gold-ink"
                >
                  Email us about this order →
                </a>
              ) : (
                <Link href="/contact" className="inline-block py-2.5 text-muted transition-colors hover:text-gold-ink">
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
              {order.items.map((item, index) => (
                <li key={`${item.slug}-${item.sizeLabel}-${item.subscription?.intervalDays ?? 0}`} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <Link
                      href={`/shop/${item.slug}`}
                      className="block truncate py-0.5 text-navy transition-colors hover:text-gold-ink"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {item.sizeLabel} × {item.quantity}
                    </p>
                    {(() => {
                      // The VeriCert lot(s) this line was filled from, each linked to its permanent lot page (its
                      // published certificate, or a plain statement that none is published yet). Several lots: each
                      // with its quantity.
                      const lots = (fulfilledLots.get(index) ?? []).filter((l) => l.vericertLot);
                      if (lots.length === 0) return null;
                      return (
                        <p className="font-mono text-xs text-navy" data-fulfilled-lots>
                          {lots.length === 1 ? "Lot " : "Lots "}
                          {lots.map((l, i) => (
                            <span key={l.vericertLot}>
                              {i > 0 && ", "}
                              <Link href={`/lot/${encodeURIComponent(l.vericertLot!)}`} className="inline-block py-1 underline-offset-4 hover:underline">
                                {l.vericertLot}
                              </Link>
                              {lots.length > 1 && ` (${l.quantity})`}
                            </span>
                          ))}
                        </p>
                      );
                    })()}
                    {item.subscription && (
                      <p className="text-xs text-muted">
                        Subscription · every {item.subscription.intervalDays} days
                        {item.subscription.discountPercent ? ` · ${item.subscription.discountPercent}% off` : ""}
                      </p>
                    )}
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
