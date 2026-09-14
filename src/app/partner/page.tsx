import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getAffiliateByEmail, computeAffiliateSummaries, listPayouts, getNextTier, getTierInfo } from "@/lib/affiliates";
import { listOrders } from "@/lib/orders/store";
import { listPromoCodes } from "@/lib/promotions";
import { listResources } from "@/lib/hq";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner Portal | VeriCert", robots: { index: false, follow: false } };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gold/20 bg-surface p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted">{label}</p>
      <p className="mt-2 font-mono text-xl text-gold-ink">{value}</p>
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
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Partner Portal</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p>
      <Link
        href={ctaHref ?? "/account"}
        className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold-ink transition-colors hover:bg-gold hover:text-black"
      >
        {ctaLabel ?? "Go to My Account"}
      </Link>
    </div>
  );
}

// Same qualifying-order rule used by computeAffiliateSummaries — kept local
// since this page needs the underlying order-level detail, not just totals.
function isQualifying(order: Order): boolean {
  return Boolean(order.paidAt) && order.status !== "cancelled" && !order.refundedAt;
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

    const [orders, promoCodes, payouts, resources] = await Promise.all([
      listOrders(),
      listPromoCodes(),
      listPayouts(affiliate.id),
      listResources(),
    ]);
    const [summary] = computeAffiliateSummaries([affiliate], orders, promoCodes, payouts);

    const driven = orders.filter((o) => o.promoCodeId && o.promoCodeId === affiliate.promoCodeId && isQualifying(o));

    // Personal best: highest single calendar-month revenue driven.
    const monthTotals = new Map<string, number>();
    for (const order of driven) {
      const monthKey = order.paidAt!.slice(0, 7);
      monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + order.total);
    }
    const personalBest = [...monthTotals.entries()].sort((a, b) => b[1] - a[1])[0];

    // Which products convert — grouped by product, no customer detail exposed.
    const productTotals = new Map<string, { name: string; revenue: number; units: number }>();
    for (const order of driven) {
      for (const item of order.items) {
        const entry = productTotals.get(item.slug) ?? { name: item.name, revenue: 0, units: 0 };
        entry.revenue += item.priceUsd * item.quantity;
        entry.units += item.quantity;
        productTotals.set(item.slug, entry);
      }
    }
    const topProducts = [...productTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const tier = affiliate.tier;
    const nextTier = tier ? getNextTier(tier) : undefined;
    const currentTierInfo = tier ? getTierInfo(tier) : undefined;
    const projectedAtNextTier = nextTier ? summary.ytdRevenue * (nextTier.commissionRate / 100) : null;

    // Onboarding checklist — every item is derived from data the account
    // already has, nothing new to track.
    const checklist = [
      { label: "Verify your email", done: customer.emailVerified },
      { label: "Drive your first qualifying order", done: summary.ordersDriven > 0 },
      { label: "Receive your first commission payout", done: summary.commissionPaid > 0 },
    ];
    const checklistDone = checklist.filter((c) => c.done).length;

    return (
      <div className="mx-auto max-w-4xl px-6 py-16 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Partner Portal</p>
            <h1 className="mt-3 font-serif text-3xl text-navy">{affiliate.name}</h1>
            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted">Your Affiliate Code</p>
            <p className="mt-1 font-mono text-3xl text-gold-ink">{summary.code ?? "—"}</p>
          </div>
          <Link
            href="/hq"
            className="border border-gold px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-gold-ink transition-colors hover:bg-gold hover:text-black"
          >
            Go to HQ →
          </Link>
        </div>

        {checklistDone < checklist.length && (
          <section className="mt-8 border border-gold/20 bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Getting Started</h2>
              <span className="text-xs text-muted">
                {checklistDone} / {checklist.length}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${(checklistDone / checklist.length) * 100}%` }}
              />
            </div>
            <ul className="mt-4 space-y-2">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-sm">
                  <span className={item.done ? "text-gold-ink" : "text-muted/50"}>{item.done ? "✓" : "○"}</span>
                  <span className={item.done ? "text-muted line-through" : "text-muted"}>{item.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tier && currentTierInfo && (
          <section className="mt-10 border-t border-hairline pt-8">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Tier Status</h2>
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <div className="border border-gold bg-gold/10 px-5 py-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gold-ink/70">Current Tier</p>
                <p className="mt-1 font-serif text-xl text-gold-ink">{currentTierInfo.label}</p>
                <p className="mt-1 text-xs text-muted">{currentTierInfo.commissionRate}% commission</p>
              </div>
              {nextTier && projectedAtNextTier !== null && (
                <div className="border border-hairline px-5 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted">Next Tier</p>
                  <p className="mt-1 font-serif text-xl text-navy">{nextTier.label}</p>
                  <p className="mt-1 text-xs text-muted">
                    At {nextTier.commissionRate}%, your YTD revenue would earn ${projectedAtNextTier.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="mt-10 border-t border-hairline pt-8">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Your Production</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Orders Driven" value={String(summary.ordersDriven)} />
            <Stat label="Gross Revenue" value={`$${summary.grossRevenue.toFixed(2)}`} />
            <Stat label="YTD Revenue" value={`$${summary.ytdRevenue.toFixed(2)}`} />
          </div>
          {personalBest && (
            <p className="mt-4 text-sm text-gold-ink">
              🏆 Personal best: ${personalBest[1].toFixed(2)} in {personalBest[0]}
            </p>
          )}
        </section>

        {topProducts.length > 0 && (
          <section className="mt-10 border-t border-hairline pt-8">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">What&apos;s Converting</h2>
            <ul className="mt-4 space-y-2">
              {topProducts.map((p) => (
                <li key={p.name} className="flex justify-between text-sm text-muted">
                  <span>
                    {p.name} <span className="text-muted/70">× {p.units}</span>
                  </span>
                  <span className="font-mono text-navy">${p.revenue.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10 border-t border-hairline pt-8">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Your Commission</h2>
          <p className="mt-3 text-sm text-muted">
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

        {payouts.length > 0 && (
          <section className="mt-10 border-t border-hairline pt-8">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Payout History</h2>
            <ul className="mt-4 space-y-2">
              {payouts.map((p) => (
                <li key={p.id} className="flex justify-between text-sm text-muted">
                  <span>
                    {new Date(p.paidAt).toLocaleDateString()}
                    {p.note && <span className="ml-2 text-muted/70">— {p.note}</span>}
                  </span>
                  <span className="font-mono text-gold-ink">${p.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {resources.length > 0 && (
          <section className="mt-10 border-t border-hairline pt-8">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Marketing Assets</h2>
            <ul className="mt-4 space-y-2">
              {resources.map((r) => (
                <li key={r.id}>
                  <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-gold-ink">
                    {r.title}
                  </a>
                  {r.description && <span className="ml-2 text-xs text-muted/70">— {r.description}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <StatusScreen
      title="Become an Affiliate"
      message="This account isn't registered as an affiliate yet."
      ctaHref="/register?affiliate=1"
      ctaLabel="Sign Up as an Affiliate"
    />
  );
}
