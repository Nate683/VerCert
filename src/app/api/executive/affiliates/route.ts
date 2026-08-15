import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import {
  listAffiliates,
  createAffiliate,
  computeAffiliateSummaries,
  getAllPayouts,
} from "@/lib/affiliates";
import { listOrders } from "@/lib/orders/store";
import { listPromoCodes } from "@/lib/promotions";
import { affiliateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "name",
  "email",
  "code",
  "commissionType",
  "commissionRate",
  "commissionFlatAmount",
  "ordersDriven",
  "grossRevenue",
  "commissionEarned",
  "commissionPaid",
  "balanceOwed",
  "ytdRevenue",
  "ytdCommission",
];

// Affiliates are /command-only — /office never sees or can call this.
export const GET = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [affiliates, orders, promoCodes, payouts] = await Promise.all([
    listAffiliates(),
    listOrders(),
    listPromoCodes(),
    getAllPayouts(),
  ]);

  const summaries = computeAffiliateSummaries(affiliates, orders, promoCodes, payouts);

  const { searchParams } = new URL(request.url);
  if (searchParams.get("format") === "csv") {
    const csv = toCsv(
      summaries.map((a) => ({
        name: a.name,
        email: a.email,
        code: a.code ?? "",
        commissionType: a.commissionType,
        commissionRate: a.commissionRate.toFixed(2),
        commissionFlatAmount: a.commissionFlatAmount.toFixed(2),
        ordersDriven: a.ordersDriven,
        grossRevenue: a.grossRevenue.toFixed(2),
        commissionEarned: a.commissionEarned.toFixed(2),
        commissionPaid: a.commissionPaid.toFixed(2),
        balanceOwed: a.balanceOwed.toFixed(2),
        ytdRevenue: a.ytdRevenue.toFixed(2),
        ytdCommission: a.ytdCommission.toFixed(2),
      })),
      CSV_COLUMNS
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=vericert-affiliates.csv",
      },
    });
  }

  return NextResponse.json({ affiliates: summaries });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, affiliateSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const affiliate = await createAffiliate(parsed.data);
    const actor = await getCurrentCustomer();
    if (actor) await logActivity(actor.email, "affiliate.created", affiliate.name);
    return NextResponse.json({ affiliate });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create affiliate." },
      { status: 400 }
    );
  }
});
