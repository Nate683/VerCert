import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { buildCustomerRecord } from "@/lib/marketing/customer-record";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// "Download my data": a machine-readable copy of everything held about the
// signed-in customer — the access and portability right under the Texas DPSA
// and CCPA.
export const GET = withApiErrorHandling(async () => {
  const user = await getCurrentCustomer();
  if (!user) {
    return NextResponse.json({ error: "Sign in to download your data." }, { status: 401 });
  }

  const limit = await checkRateLimit(`account-export:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const record = await buildCustomerRecord(user);
  return new NextResponse(JSON.stringify(record, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vericert-data-${record.generatedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
