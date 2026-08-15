import { NextResponse } from "next/server";
import { requireExecutiveSession, requireCommandSession } from "@/lib/executive/require-auth";
import { listOrders } from "@/lib/orders/store";
import { listUsers } from "@/lib/users/store";
import { listAffiliates, computeAffiliateSummaries, getAllPayouts } from "@/lib/affiliates";
import { listPromoCodes } from "@/lib/promotions";
import { computeCustomerSummaries } from "@/lib/executive/customers";
import { computeRevenueSeries } from "@/lib/executive/stats";
import { computeFunnel } from "@/lib/analytics";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const isCommand = await requireCommandSession();

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));

  const [orders, users, promoCodes, payouts] = await Promise.all([
    listOrders(),
    listUsers(),
    listPromoCodes(),
    getAllPayouts(),
  ]);

  const trendSeries = computeRevenueSeries(orders, days);
  const funnel = await computeFunnel(days);
  const topCustomers = computeCustomerSummaries(users, orders).slice(0, 10);

  // Affiliate leaderboard is command-only data, but harmless to omit for office.
  let topAffiliates: { name: string; grossRevenue: number; ordersDriven: number }[] = [];
  if (isCommand) {
    const affiliates = await listAffiliates();
    topAffiliates = computeAffiliateSummaries(affiliates, orders, promoCodes, payouts)
      .slice(0, 10)
      .map((a) => ({ name: a.name, grossRevenue: a.grossRevenue, ordersDriven: a.ordersDriven }));
  }

  return NextResponse.json({ trendSeries, funnel, topCustomers, topAffiliates, days });
});
