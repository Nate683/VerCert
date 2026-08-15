import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserByEmail } from "@/lib/users/store";
import { verifyPassword } from "@/lib/users/password";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken } from "@/lib/users/session";
import { getRealmForEmail, ensureStaffAccount } from "@/lib/executive/staff";
import { getAffiliateByEmail } from "@/lib/affiliates";
import { loginSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`login:${ip}`, { limit: 10, windowMs: 5 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, loginSchema);
  if ("error" in parsed) return parsed.error;
  const { email, password, isAffiliate, affiliateCode } = parsed.data;

  // First-ever login for a staff email provisions its account so there's no
  // separate signup step for executives.
  const realm = getRealmForEmail(email);
  if (realm) await ensureStaffAccount(realm);

  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  // Affiliate portal access requires a second, separate code (not the
  // password) so a customer can't reach another affiliate's production data.
  if (isAffiliate) {
    const affiliate = await getAffiliateByEmail(email);
    if (
      !affiliate ||
      !affiliate.active ||
      !affiliate.portalCode ||
      affiliate.portalCode !== affiliateCode?.toUpperCase()
    ) {
      return NextResponse.json({ error: "Incorrect affiliate code." }, { status: 401 });
    }
  }

  const token = await createCustomerSessionToken(user.id);
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true, isAffiliate: Boolean(isAffiliate) });
});
