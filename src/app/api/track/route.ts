import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { trackEvent } from "@/lib/analytics";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/users/session";
import { trackEventSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Public, best-effort event ingestion (page_view/product_view/add_to_cart/
// checkout_started/order_completed) — no auth, rate-limited by IP. A signed-in
// visitor's events are tied to their account.
export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`track:${ip}`, { limit: 120, windowMs: 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, trackEventSchema);
  if ("error" in parsed) return parsed.error;

  const session = await verifyCustomerSessionToken((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value);
  await trackEvent(parsed.data.event, parsed.data.sessionId, parsed.data.metadata, session?.userId);
  return NextResponse.json({ ok: true });
});
