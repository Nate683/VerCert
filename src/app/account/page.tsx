import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getOrdersByCustomer } from "@/lib/orders/store";
import { getAffiliateByEmail } from "@/lib/affiliates";
import { listProducts, resolveUnitPrice } from "@/lib/products";
import type { CartItem, OrderStatus } from "@/lib/types";
import { AddressForm } from "./AddressForm";
import { MarketingToggle } from "./MarketingToggle";
import { ResendVerification } from "./ResendVerification";
import { AccountLogoutButton } from "./AccountLogoutButton";
import { EmailChangeForm } from "./EmailChangeForm";
import { ReorderButton } from "./ReorderButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Account | VeriCert", robots: { index: false, follow: false } };

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  expired: "Payment Expired",
  cancelled: "Cancelled",
};

// Status colour carries meaning at a glance: gold = we're waiting on the
// customer, green = in motion, dim = closed.
const STATUS_TONE: Record<OrderStatus, string> = {
  awaiting_payment: "border-gold/50 bg-gold/10 text-gold",
  expired: "border-red-400/40 bg-red-500/10 text-red-200",
  cancelled: "border-white/15 bg-white/[0.03] text-white/40",
  paid: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  processing: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  shipped: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  delivered: "border-white/15 bg-white/[0.03] text-white/50",
};

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/account");

  const [orders, affiliate, products] = await Promise.all([
    getOrdersByCustomer(customer.id),
    getAffiliateByEmail(customer.email),
    listProducts(),
  ]);

  // Re-price each past order against the live catalog so "Reorder" never puts
  // a stale price in the cart.
  const reorderable = orders.map((order) => {
    const items: CartItem[] = [];
    const unavailable: string[] = [];
    for (const item of order.items) {
      const product = products.find((p) => p.slug === item.slug);
      const size = product?.sizes.find((s) => s.label === item.sizeLabel);
      if (!product || !size || product.active === false) {
        unavailable.push(item.name);
        continue;
      }
      items.push({
        slug: product.slug,
        name: product.name,
        sizeLabel: size.label,
        priceUsd: resolveUnitPrice(size, item.quantity),
        quantity: item.quantity,
      });
    }
    return { id: order.id, items, unavailable };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
          <h1 className="mt-3 font-serif text-3xl text-white">{customer.email}</h1>
          {!customer.emailVerified && (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-white/40">Email not verified.</span>
              <ResendVerification />
            </div>
          )}
        </div>
        <AccountLogoutButton />
      </div>

      {affiliate?.active && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-gold/30 bg-gold/5 px-5 py-4">
          <p className="text-sm text-white/70">You&apos;re a VeriCert affiliate.</p>
          <Link
            href="/partner"
            className="border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black"
          >
            Partner Portal →
          </Link>
        </div>
      )}

      {/* Orders first — it is the reason people sign in. */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Order History</h2>
          {orders.length > 0 && (
            <span className="text-xs text-white/30">
              {orders.length} order{orders.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="mt-4 border border-white/10 p-8 text-center">
            <p className="text-sm text-white/50">You haven&apos;t placed any orders yet.</p>
            <Link
              href="/shop"
              className="mt-5 inline-block border border-gold px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-gold transition-colors hover:bg-gold hover:text-black"
            >
              Browse the Catalog
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {orders.map((order) => {
              const reorder = reorderable.find((r) => r.id === order.id);
              return (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div className="min-w-0">
                    <Link
                      href={`/order/${order.reference}`}
                      className="font-mono text-sm text-white transition-colors hover:text-gold"
                    >
                      {order.reference}
                    </Link>
                    <p className="mt-1 text-xs text-white/40">
                      {new Date(order.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                      <span className="font-mono">${order.total.toFixed(2)}</span>
                    </p>
                    <p className="mt-1 truncate text-xs text-white/30">
                      {order.items.map((i) => `${i.name} (${i.sizeLabel})`).join(", ")}
                    </p>
                    {order.status === "shipped" && (order.carrier || order.trackingNumber) && (
                      <p className="mt-1.5 font-mono text-xs text-gold">
                        {order.carrier ? `${order.carrier} · ` : ""}
                        {order.trackingNumber}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`border px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] ${
                        STATUS_TONE[order.status]
                      }`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                    <ReorderButton
                      items={reorder?.items ?? []}
                      unavailable={reorder?.unavailable ?? []}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12 border-t border-white/10 pt-8">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Saved Shipping Address</h2>
        <p className="mt-2 text-xs text-white/35">
          Used to pre-fill checkout so returning orders take a few seconds.
        </p>
        <div className="mt-4">
          <AddressForm initialAddress={customer.savedAddress} />
        </div>
      </section>

      <section className="mt-12 border-t border-white/10 pt-8">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Email Address</h2>
        <div className="mt-4">
          <EmailChangeForm pendingEmail={customer.pendingEmail} />
        </div>
      </section>

      <section className="mt-12 border-t border-white/10 pt-8">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Email Preferences</h2>
        <div className="mt-4">
          <MarketingToggle initialOptIn={customer.marketingOptIn} />
        </div>
      </section>
    </div>
  );
}
