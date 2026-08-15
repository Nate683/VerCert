import type { Affiliate, AffiliatePayout, AffiliateSummary, Order, PromoCode } from "@/lib/types";

// Orders qualify for commission once paid and never refunded/cancelled —
// mirrors the revenue-recognition rule used everywhere else in the app.
function isQualifying(order: Order): boolean {
  return Boolean(order.paidAt) && order.status !== "cancelled" && !order.refundedAt;
}

function commissionForOrder(affiliate: Affiliate, order: Order): number {
  if (affiliate.commissionType === "flat") return affiliate.commissionFlatAmount;
  return order.total * (affiliate.commissionRate / 100);
}

export function computeAffiliateSummaries(
  affiliates: Affiliate[],
  orders: Order[],
  promoCodes: PromoCode[],
  payouts: AffiliatePayout[]
): AffiliateSummary[] {
  const now = new Date();
  const codeById = new Map(promoCodes.map((p) => [p.id, p]));

  return affiliates
    .map((affiliate) => {
      const code = affiliate.promoCodeId ? codeById.get(affiliate.promoCodeId) : undefined;
      const driven = orders.filter(
        (o) => o.promoCodeId && o.promoCodeId === affiliate.promoCodeId && isQualifying(o)
      );
      const ytdDriven = driven.filter((o) => new Date(o.paidAt!).getFullYear() === now.getFullYear());

      const grossRevenue = driven.reduce((sum, o) => sum + o.total, 0);
      const commissionEarned = driven.reduce((sum, o) => sum + commissionForOrder(affiliate, o), 0);
      const ytdRevenue = ytdDriven.reduce((sum, o) => sum + o.total, 0);
      const ytdCommission = ytdDriven.reduce((sum, o) => sum + commissionForOrder(affiliate, o), 0);

      const commissionPaid = payouts
        .filter((p) => p.affiliateId === affiliate.id)
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        ...affiliate,
        code: code?.code,
        ordersDriven: driven.length,
        grossRevenue,
        commissionEarned,
        commissionPaid,
        balanceOwed: Math.max(0, commissionEarned - commissionPaid),
        ytdRevenue,
        ytdCommission,
      };
    })
    .sort((a, b) => b.grossRevenue - a.grossRevenue);
}
