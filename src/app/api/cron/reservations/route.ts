import { NextResponse } from "next/server";
import { sweepExpiredReservations } from "@/lib/inventory";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The reservation-expiry sweep, for a scheduled caller (Vercel Cron). Authorized exactly like the subscriptions cron:
// `Authorization: Bearer $CRON_SECRET`, and without the variable it never runs. Scheduled DAILY in vercel.json (owner
// decision 2026-11-18: request-time expiry is primary, this is the backstop; daily is allowed on every Vercel plan).
// Each run writes a heartbeat (job_runs) that the Executive Office Reservations tab shows.
//
// Correctness never depends on it: every read of available-to-sell (shop, product page, checkout, Stock tab) counts an
// expired hold as free at the moment of reading; checkout releases expired holds on the strengths it touches; the
// customer's order page releases its own. The sweep only brings the stored Reserved figure back in line.
export const GET = withApiErrorHandling(async (request: Request) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const released = await sweepExpiredReservations("system:cron", "cron");
  return NextResponse.json({ released });
});
