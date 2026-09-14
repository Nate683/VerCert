import { cookies } from "next/headers";
import {
  TWO_FACTOR_CHALLENGE_COOKIE,
  TWO_FACTOR_CHALLENGE_TTL_MS,
  createTwoFactorChallengeToken,
  verifyTwoFactorChallengeToken,
} from "@/lib/users/session";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { getUserById } from "@/lib/users/store";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { Customer } from "@/lib/types";
import { requiresTwoFactor } from "./store";

// The step between a correct password and a real session, for accounts that
// require two-factor. The browser holds a short-lived signed challenge cookie;
// /two-factor and /api/auth/two-factor/* only ever act on the account it names.

export async function startTwoFactorChallenge(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TWO_FACTOR_CHALLENGE_COOKIE, await createTwoFactorChallengeToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TWO_FACTOR_CHALLENGE_TTL_MS / 1000,
  });
}

export async function getTwoFactorChallengeUser(): Promise<Customer | null> {
  const cookieStore = await cookies();
  const userId = await verifyTwoFactorChallengeToken(
    cookieStore.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value
  );
  if (!userId) return null;
  const user = await getUserById(userId);
  return user && requiresTwoFactor(user) ? user : null;
}

export function challengeExpiredResponse(): Response {
  return Response.json(
    { error: "Your sign-in has expired. Please sign in again." },
    { status: 401 }
  );
}

export async function completeTwoFactorSignIn(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TWO_FACTOR_CHALLENGE_COOKIE);
  await setCustomerSessionCookie(userId, { twoFactorVerified: true });
}

// Shared by sign-in verification and enrollment. Keyed per account rather
// than per IP: only someone who already has the password gets this far, and a
// six-digit code with ±1 step of drift is a ~3-in-a-million guess, so the
// daily cap is what keeps a password-holding attacker's odds negligible.
export async function checkTwoFactorRateLimit(userId: string): Promise<Response | null> {
  const burst = await checkRateLimit(`2fa:${userId}:15m`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!burst.allowed) return rateLimitResponse(burst.retryAfterSeconds);
  const daily = await checkRateLimit(`2fa:${userId}:24h`, {
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!daily.allowed) return rateLimitResponse(daily.retryAfterSeconds);
  return null;
}
