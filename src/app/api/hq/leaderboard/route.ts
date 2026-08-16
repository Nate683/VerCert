import { NextResponse } from "next/server";
import { getHqMember, isLeaderboardEnabled } from "@/lib/hq";
import { listAffiliates, computeAffiliateSummaries } from "@/lib/affiliates";
import { listOrders } from "@/lib/orders/store";
import { listPromoCodes } from "@/lib/promotions";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Revenue + tier ranking only — never commission $ figures, which stay
// private to each affiliate (and to executives via /command).
export const GET = withApiErrorHandling(async () => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const enabled = await isLeaderboardEnabled();
  if (!enabled) return NextResponse.json({ enabled: false, entries: [] });

  const [affiliates, orders, promoCodes] = await Promise.all([
    listAffiliates(),
    listOrders(),
    listPromoCodes(),
  ]);
  const summaries = computeAffiliateSummaries(
    affiliates.filter((a) => a.active),
    orders,
    promoCodes,
    []
  );

  const entries = summaries.map((s) => ({
    name: s.name,
    tier: s.tier,
    grossRevenue: s.grossRevenue,
    ordersDriven: s.ordersDriven,
  }));

  return NextResponse.json({ enabled: true, entries });
});
