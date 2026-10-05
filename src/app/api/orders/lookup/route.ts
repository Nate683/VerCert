import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getOrderByReference } from "@/lib/orders/store";
import { ORDER_ACCESS_COOKIE, grantOrderAccess, orderAccessCookieOptions } from "@/lib/orders/guest-access";
import { parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const lookupSchema = z.object({
  reference: z.string().trim().min(3).max(40),
  email: z.string().trim().toLowerCase().email(),
});

// Order status without an account: the reference AND the email the order was
// placed with must both match. One answer for every failure, so the form
// can't be used to find out which references exist.
export const POST = withApiErrorHandling(async (request: Request) => {
  const limit = await checkRateLimit(`order-lookup:${getClientIp(request)}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, lookupSchema);
  if ("error" in parsed) return parsed.error;
  const reference = parsed.data.reference.toUpperCase().replace(/\s+/g, "");

  const order = await getOrderByReference(reference);
  if (!order || order.customer.email.trim().toLowerCase() !== parsed.data.email) {
    return NextResponse.json(
      { error: "We couldn't find an order with that reference and email. Check both against your confirmation email." },
      { status: 404 }
    );
  }

  const jar = await cookies();
  const token = await grantOrderAccess(jar.get(ORDER_ACCESS_COOKIE)?.value, order.reference);
  jar.set(ORDER_ACCESS_COOKIE, token, orderAccessCookieOptions);
  return NextResponse.json({ reference: order.reference });
});
