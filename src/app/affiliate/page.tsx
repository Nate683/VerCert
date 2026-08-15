import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getAffiliateByEmail, computeAffiliateSummaries, listPayouts } from "@/lib/affiliates";
import { listOrders } from "@/lib/orders/store";
import { listPromoCodes } from "@/lib/promotions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliate Portal | VeriCert", robots: { index: false, follow: false } };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gold/20 bg-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">{label}</p>
      <p className="mt-2 font-mono text-xl text-gold">{value}</p>
    </div>
  );
}

export default async function AffiliatePage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/affiliate");

  const affiliate = await getAffiliateByEmail(customer.email);

  if (!affiliate) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Affiliate Portal</p>
        <h1 className="mt-3 font-serif text-3xl text-white">Not an Affiliate</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          This account isn&apos;t registered as an affiliate. If you believe this is a mistake,
          contact us.
        </p>
        <Link
          href="/account"
          className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
        >
          Go to My Account
        </Link>
      </div>
    );
  }

  const [orders, promoCodes, payouts] = await Promise.all([
    listOrders(),
    listPromoCodes(),
    listPayouts(affiliate.id),
  ]);
  const [summary] = computeAffiliateSummaries([affiliate], orders, promoCodes, payouts);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 lg:px-10">
      <div className="border-b border-white/10 pb-6">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Affiliate Portal</p>
        <h1 className="mt-3 font-serif text-3xl text-white">{affiliate.name}</h1>
        {!affiliate.active && (
          <p className="mt-2 text-xs text-red-300">
            Your affiliate account is currently inactive — contact us with any questions.
          </p>
        )}
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/40">Your Affiliate Code</p>
        <p className="mt-1 font-mono text-3xl text-gold">{summary.code ?? "—"}</p>
      </div>

      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Your Production</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Orders Driven" value={String(summary.ordersDriven)} />
          <Stat label="Gross Revenue" value={`$${summary.grossRevenue.toFixed(2)}`} />
          <Stat label="YTD Revenue" value={`$${summary.ytdRevenue.toFixed(2)}`} />
        </div>
      </section>

      <section className="mt-10 border-t border-white/10 pt-8">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Your Commission</h2>
        <p className="mt-3 text-sm text-white/70">
          {affiliate.commissionType === "percent"
            ? `${affiliate.commissionRate}% of each qualifying order`
            : `$${affiliate.commissionFlatAmount.toFixed(2)} flat per qualifying order`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Commission Earned" value={`$${summary.commissionEarned.toFixed(2)}`} />
          <Stat label="Commission Paid" value={`$${summary.commissionPaid.toFixed(2)}`} />
          <Stat label="Balance Owed" value={`$${summary.balanceOwed.toFixed(2)}`} />
          <Stat label="YTD Commission" value={`$${summary.ytdCommission.toFixed(2)}`} />
        </div>
      </section>
    </div>
  );
}
