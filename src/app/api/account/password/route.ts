import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";
import { hashPassword, verifyPassword } from "@/lib/users/password";
import { passwordProblem } from "@/lib/users/password-policy";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/users/session";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { logActivity } from "@/lib/activity-log";
import { changePasswordSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Account Settings → Change Password, for a signed-in account.
//
// - The current password is verified HERE, on the server, against the stored
//   hash (verifyPassword), before anything is written. A session alone is
//   never enough to set a new password.
// - Throttled like account deletion (5 per account per hour) plus a per-IP
//   cap, so a stolen session can't be used to guess the current password.
// - On success every OTHER session is ended: users.sessions_valid_after is set
//   to now, and getCurrentCustomer turns away any session that signed in
//   before it. A customer's own browser gets a fresh session and stays signed
//   in. A two-factor (executive) session is not re-issued from here, since a
//   new one would restart its sign-in limit, so they sign in again.
// - An outstanding reset link is voided too.
// - Passwords are never logged or echoed; the activity log records only that
//   a change happened.
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Sign in to change your password." }, { status: 401 });

  const accountLimit = await checkRateLimit(`account-password:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit.retryAfterSeconds);
  const ipLimit = await checkRateLimit(`account-password:ip:${getClientIp(request)}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSeconds);

  const parsed = await parseBody(request, changePasswordSchema);
  if ("error" in parsed) return parsed.error;
  const { currentPassword, newPassword } = parsed.data;

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Your current password isn't right." }, { status: 401 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "Choose a password different from your current one." }, { status: 400 });
  }
  const weakPassword = await passwordProblem(newPassword, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  if (weakPassword) return NextResponse.json({ error: weakPassword }, { status: 400 });

  const cookieStore = await cookies();
  const session = await verifyCustomerSessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  const now = Date.now();
  await updateUser(user.id, {
    passwordHash: await hashPassword(newPassword),
    sessionsValidAfter: new Date(now).toISOString(),
    resetToken: undefined,
    resetTokenExpiresAt: undefined,
  });
  await logActivity(user.email, "account.password_changed", "Changed from Account Settings; other sessions signed out.");

  if (session?.twoFactorVerified) {
    cookieStore.delete(CUSTOMER_SESSION_COOKIE);
    return NextResponse.json({ ok: true, signedOut: true, next: "/executive" });
  }
  // This browser's new session counts from the same instant as the cut-off,
  // so it is the one session that stays.
  await setCustomerSessionCookie(user.id, { signedInAt: now });
  return NextResponse.json({ ok: true, signedOut: false });
});
