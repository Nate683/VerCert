import { cookies } from "next/headers";
import {
  CUSTOMER_SESSION_COOKIE,
  createCustomerSessionToken,
  sessionCookieOptions,
  sessionTtlMs,
  type SessionOptions,
} from "./session";

// Server-only — for Route Handlers, which are the only place a cookie can be set.
// Returns when the session expires.
export async function setCustomerSessionCookie(userId: string, opts: SessionOptions = {}): Promise<number> {
  const ttlMs = sessionTtlMs(opts);
  const token = await createCustomerSessionToken(userId, opts);
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, sessionCookieOptions(ttlMs));
  return Date.now() + ttlMs;
}
