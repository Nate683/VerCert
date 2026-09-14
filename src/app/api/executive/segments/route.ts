import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { listCustomerMetrics } from "@/lib/marketing/customer-metrics";
import {
  describeSegment,
  matchesSegment,
  parseSegmentFilters,
  segmentOptions,
  segmentToCsv,
  summarizeSegment,
} from "@/lib/marketing/segments";
import { logActivity } from "@/lib/activity-log";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Customer segments for /command. Command-only: an export is a list of real
// people's contact details, so /office can't pull one even via the API, and
// every export is written to the activity log.
export const GET = withApiErrorHandling(async (request: Request) => {
  const viewer = await getCurrentCustomer();
  if (viewer?.role !== "command") {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseSegmentFilters(url.searchParams);
  const now = Date.now();
  const all = await listCustomerMetrics();
  const matched = all.filter((c) => matchesSegment(c, filters, now));

  if (url.searchParams.get("format") === "csv") {
    await logActivity(viewer.email, "segment.exported", `${matched.length} customer(s): ${describeSegment(filters)}`);
    return new NextResponse(segmentToCsv(matched), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vericert-segment-${new Date(now).toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    customers: matched,
    summary: summarizeSegment(all, matched, filters, now),
    options: segmentOptions(all),
  });
});
