import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { searchPublic } from "@/lib/coa/public";

export const dynamic = "force-dynamic";

// Public certificate search (no sign-in). The one search behind both the header's VERIFY BEFORE YOU BUY panel and
// the Every Lot Certified search on /how-we-test. Returns only approved, published, non-test certificates.
export const GET = withApiErrorHandling(async (request: Request) => {
  const limit = await checkRateLimit(`verify-search:${getClientIp(request)}`, { limit: 120, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  // The same result for every visitor; no session is read. Catalog rows carry compound, strength and SKU only.
  const result = await searchPublic(q);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});
