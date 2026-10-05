import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken, sessionTtlMs } from "./session";

// Server-only — for Route Handlers, which are the only place a cookie can be set.
// Returns when the session expires.
export async function setCustomerSessionCookie(
  userId: string,
  opts: { twoFactorVerified?: boolean } = {}
): Promise<number> {
  const ttlMs = sessionTtlMs(opts);
  const token = await createCustomerSessionToken(userId, opts);
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
  return Date.now() + ttlMs;
}
