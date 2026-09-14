import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken } from "./session";

// Server-only — for Route Handlers, which are the only place a cookie can be set.
export async function setCustomerSessionCookie(
  userId: string,
  opts: { twoFactorVerified?: boolean } = {}
): Promise<void> {
  const token = await createCustomerSessionToken(userId, opts);
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
