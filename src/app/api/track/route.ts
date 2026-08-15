import { NextResponse } from "next/server";
import { trackEvent } from "@/lib/analytics";
import { trackEventSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Public, best-effort funnel event ingestion (page_view/add_to_cart/
// checkout_started/order_completed) — no auth, rate-limited by IP.
export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`track:${ip}`, { limit: 120, windowMs: 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, trackEventSchema);
  if ("error" in parsed) return parsed.error;

  await trackEvent(parsed.data.event, parsed.data.sessionId, parsed.data.metadata);
  return NextResponse.json({ ok: true });
});
