import { NextResponse } from "next/server";
import { runDueSubscriptions } from "@/lib/subscriptions/run";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily Vercel Cron (vercel.json) that places due subscription orders. Vercel
// sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set, and the
// route refuses everything else — without the variable it never runs.
export const GET = withApiErrorHandling(async (request: Request) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const results = await runDueSubscriptions();
  return NextResponse.json({ ran: results.length, results });
});
