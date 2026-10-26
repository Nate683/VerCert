import { NextResponse } from "next/server";
import { redeemSignInLink } from "@/lib/affiliates";
import { updateUser } from "@/lib/users/store";
import { generateToken } from "@/lib/users/password";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

// Long enough to choose a password on the welcome screen without rushing.
const SET_PASSWORD_TTL_MS = 60 * 60 * 1000;

// Spends a single-use affiliate sign-in link (from /partner/start) and signs
// that account in. It also issues a short-lived set-password token, so the
// partner portal can offer to choose a password through the normal
// reset-password endpoint and its password rules.
export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`sign-in-link:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token.trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const user = await redeemSignInLink(token);
  if (!user) {
    return NextResponse.json(
      { error: "This sign-in link has already been used or has expired. Ask VeriCert for a new one." },
      { status: 400 }
    );
  }

  await updateUser(user.id, {
    resetToken: generateToken(),
    resetTokenExpiresAt: new Date(Date.now() + SET_PASSWORD_TTL_MS).toISOString(),
  });
  await setCustomerSessionCookie(user.id);
  await logActivity(user.email, "affiliate.sign_in_link_used");

  return NextResponse.json({ ok: true, next: "/partner?welcome=1" });
});
