import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/users/store";
import { verifyPassword } from "@/lib/users/password";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { getRealmForEmail, ensureStaffAccount } from "@/lib/executive/staff";
import { getAffiliateByPortalCode } from "@/lib/affiliates";
import { requiresTwoFactor } from "@/lib/two-factor/store";
import { startTwoFactorChallenge } from "@/lib/two-factor/challenge";
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
  const { email, password, portalCode } = parsed.data;

  // The per-IP limit above can be sidestepped by spreading guesses at one
  // account across many addresses; this caps attempts per account wherever
  // they come from. It counts every attempt, so someone hammering an account
  // can hold its owner out for up to the 15-minute window.
  const accountLimit = await checkRateLimit(`login:account:${email}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit.retryAfterSeconds);

  // Affiliate quick-login: a portal code stands in for a password. The code
  // must belong to an affiliate whose email matches what was entered, so a
  // leaked code alone can't be used to log into an arbitrary email address.
  if (portalCode) {
    const affiliate = await getAffiliateByPortalCode(portalCode);
    if (!affiliate || !affiliate.active || affiliate.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "Incorrect email or affiliate code." }, { status: 401 });
    }
    const user = await getUserByEmail(affiliate.email);
    if (!user) {
      return NextResponse.json({ error: "Incorrect email or affiliate code." }, { status: 401 });
    }
    // A portal code stands in for a password, never for a second factor.
    if (requiresTwoFactor(user)) {
      return NextResponse.json(
        { error: "This account must sign in with a password." },
        { status: 401 }
      );
    }
    await setCustomerSessionCookie(user.id);
    return NextResponse.json({ ok: true });
  }

  // First-ever login for a staff email provisions its account so there's no
  // separate signup step for executives.
  const realm = getRealmForEmail(email);
  if (realm) await ensureStaffAccount(realm);

  const user = await getUserByEmail(email);
  if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  // A password alone never signs in an executive. The browser gets a
  // short-lived two-factor challenge instead of a session, and /two-factor
  // finishes signing in (enrolling an authenticator first if there isn't one).
  if (requiresTwoFactor(user)) {
    await startTwoFactorChallenge(user.id);
    return NextResponse.json({ ok: true, twoFactorRequired: true });
  }

  await setCustomerSessionCookie(user.id);
  return NextResponse.json({ ok: true });
});
