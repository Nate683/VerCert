import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserByResetToken, updateUser } from "@/lib/users/store";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/users/session";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { hashPassword } from "@/lib/users/password";
import { passwordProblem } from "@/lib/users/password-policy";
import { resetPasswordSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`reset-password:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, resetPasswordSchema);
  if ("error" in parsed) return parsed.error;
  const { token, password } = parsed.data;

  const user = await getUserByResetToken(token);
  if (
    !user ||
    !user.resetTokenExpiresAt ||
    new Date(user.resetTokenExpiresAt).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const weakPassword = await passwordProblem(password, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  if (weakPassword) return NextResponse.json({ error: weakPassword }, { status: 400 });

  // A reset is what someone does when they think another person has access,
  // so, as with Change Password, every existing session is signed out
  // (users.sessions_valid_after; enforced in getCurrentCustomer). The one
  // exception: a browser already signed in to this same account with a
  // customer session (the partner set-password card on /partner saves through
  // here) is re-issued a session from the cut-off instant and stays signed in.
  const signedInHere = await getCurrentCustomer();
  const cookieStore = await cookies();
  const session = await verifyCustomerSessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  const now = Date.now();
  const passwordHash = await hashPassword(password);
  await updateUser(user.id, {
    passwordHash,
    resetToken: undefined,
    resetTokenExpiresAt: undefined,
    sessionsValidAfter: new Date(now).toISOString(),
  });
  if (signedInHere?.id === user.id && session && !session.twoFactorVerified) {
    await setCustomerSessionCookie(user.id, { signedInAt: now });
  }

  // Executives can't sign in at /login, so send them back to their own page.
  return NextResponse.json({ ok: true, next: user.role ? "/executive" : "/login" });
});
