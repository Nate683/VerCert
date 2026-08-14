import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getOrdersByCustomer } from "@/lib/orders/store";
import { AddressForm } from "./AddressForm";
import { MarketingToggle } from "./MarketingToggle";
import { ResendVerification } from "./ResendVerification";
import { AccountLogoutButton } from "./AccountLogoutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Account | VeriCert", robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  awaiting_payment: "Awaiting Payment",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/account");

  const orders = await getOrdersByCustomer(customer.id);

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

      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Saved Shipping Address</h2>
        <div className="mt-4">
          <AddressForm initialAddress={customer.savedAddress} />
        </div>
      </section>

      <section className="mt-10 border-t border-white/10 pt-8">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Email Preferences</h2>
        <div className="mt-4">
          <MarketingToggle initialOptIn={customer.marketingOptIn} />
        </div>
      </section>

      <section className="mt-10 border-t border-white/10 pt-8">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Order History</h2>
        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">You haven&apos;t placed any orders yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/order/${order.reference}`}
                className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm transition-colors hover:text-gold"
              >
                <div>
                  <p className="font-mono text-white">{order.reference}</p>
                  <p className="text-xs text-white/40">
                    {new Date(order.createdAt).toLocaleDateString()} · {order.items.length} item(s)
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/70">${order.total.toFixed(2)}</span>
                  <span className="border border-white/20 px-2 py-1 text-xs uppercase tracking-[0.1em] text-white/50">
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
