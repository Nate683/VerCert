import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getAffiliateByEmail, computeAffiliateSummaries, listPayouts } from "@/lib/affiliates";
import { listOrders } from "@/lib/orders/store";
import { listPromoCodes } from "@/lib/promotions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner Portal | VeriCert", robots: { index: false, follow: false } };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gold/20 bg-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">{label}</p>
      <p className="mt-2 font-mono text-xl text-gold">{value}</p>
    </div>
  );
}

function StatusScreen({
  title,
  message,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  message: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Partner Portal</p>
      <h1 className="mt-3 font-serif text-3xl text-white">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/50">{message}</p>
      <Link
        href={ctaHref ?? "/account"}
        className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
      >
        {ctaLabel ?? "Go to My Account"}
      </Link>
    </div>
  );
}

export default async function PartnerPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/partner");

  const affiliate = await getAffiliateByEmail(customer.email);

  if (affiliate) {
    if (!affiliate.active) {
      return (
        <StatusScreen
          title="Account Inactive"
          message="Your affiliate account is currently inactive — contact us with any questions."
        />
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
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold">Partner Portal</p>
            <h1 className="mt-3 font-serif text-3xl text-white">{affiliate.name}</h1>
            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/40">Your Affiliate Code</p>
            <p className="mt-1 font-mono text-3xl text-gold">{summary.code ?? "—"}</p>
          </div>
          <Link
            href="/hq"
            className="border border-gold px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
          >
            Go to HQ →
          </Link>
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

  return (
    <StatusScreen
      title="Become an Affiliate"
      message="This account isn't registered as an affiliate yet."
      ctaHref="/signup?affiliate=1"
      ctaLabel="Sign Up as an Affiliate"
    />
  );
}
