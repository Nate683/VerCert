import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listOrders } from "@/lib/orders/store";
import { listProducts } from "@/lib/products";
import { listPromoCodes } from "@/lib/promotions";
import { listAffiliates, computeAffiliateSummaries, getAllPayouts } from "@/lib/affiliates";
import { computeFinancials } from "@/lib/executive/financials";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [orders, products, promoCodes, affiliates, payouts] = await Promise.all([
    listOrders(),
    listProducts({ includeInactive: true }),
    listPromoCodes(),
    listAffiliates(),
    getAllPayouts(),
  ]);
  const affiliateSummaries = computeAffiliateSummaries(affiliates, orders, promoCodes, payouts);
  const financials = computeFinancials(orders, products, promoCodes, affiliateSummaries);

  const { searchParams } = new URL(request.url);
  if (searchParams.get("format") === "csv") {
    const lines = [
      "VeriCert P&L Summary",
      `Generated,${new Date().toISOString()}`,
      "",
      "Metric,Value",
      `Revenue Today,${financials.revenue.today.current.toFixed(2)}`,
      `Revenue WTD,${financials.revenue.wtd.current.toFixed(2)}`,
      `Revenue MTD,${financials.revenue.mtd.current.toFixed(2)}`,
      `Revenue QTD,${financials.revenue.qtd.current.toFixed(2)}`,
      `Revenue YTD,${financials.revenue.ytd.current.toFixed(2)}`,
      `Revenue All Time,${financials.revenue.allTime.toFixed(2)}`,
      `Gross Revenue,${financials.grossRevenue.toFixed(2)}`,
      `Discounts Given,${financials.discountsGiven.toFixed(2)}`,
      `Commissions Owed,${financials.commissionsOwed.toFixed(2)}`,
      `Net Revenue,${financials.netRevenue.toFixed(2)}`,
      `Average Order Value,${financials.averageOrderValue.toFixed(2)}`,
      `Repeat Purchase Rate %,${financials.repeatPurchaseRate.toFixed(1)}`,
      `Customer Lifetime Value,${financials.customerLifetimeValue.toFixed(2)}`,
      `Cash - Paid,${financials.cash.paid.toFixed(2)}`,
      `Cash - Awaiting Payment,${financials.cash.awaitingPayment.toFixed(2)}`,
      `Cash - Refunded,${financials.cash.refunded.toFixed(2)}`,
      `Blended Margin %,${financials.blendedMarginPercent?.toFixed(1) ?? "n/a"}`,
      "",
      "Revenue by Category",
      "Category,Revenue",
      ...financials.revenueByCategory.map((c) => `${c.category},${c.revenue.toFixed(2)}`),
      "",
      "Revenue by Product",
      "Product,Revenue,Cost,Margin,Margin %",
      ...financials.marginByProduct.map(
        (p) => `${p.name},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.margin.toFixed(2)},${p.marginPercent?.toFixed(1) ?? "n/a"}`
      ),
      "",
      "Revenue by Promo Code",
      "Code,Revenue,Discount Given",
      ...financials.revenueByPromoCode.map((p) => `${p.code},${p.revenue.toFixed(2)},${p.discountGiven.toFixed(2)}`),
      "",
      "Revenue by Affiliate",
      "Affiliate,Revenue",
      ...financials.revenueByAffiliate.map((a) => `${a.name},${a.revenue.toFixed(2)}`),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=vericert-pl-summary.csv",
      },
    });
  }

  return NextResponse.json({ financials });
});
