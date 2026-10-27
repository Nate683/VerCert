import { createExpiringToken, verifyExpiringToken, verifyExpiringTokenWithExpiry } from "@/lib/signed-token";
import { STAFF_IDLE_TIMEOUT_MS, STAFF_SESSION_MAX_MS } from "./idle";

export const CUSTOMER_SESSION_COOKIE = "vericert_customer_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// A customer session is re-issued for another 30 days once it's this old, on
// any page they open (see proxy.ts), so it ends 30 days after their last
// visit rather than 30 days after they signed in.
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export const TWO_FACTOR_CHALLENGE_COOKIE = "vericert_2fa_challenge";
export const TWO_FACTOR_CHALLENGE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Appended to the signed payload of a session that passed two-factor, then
// "~" and the time that sign-in happened, which caps how long renewals can
// keep it going. Sessions minted before 2FA existed don't carry the marker,
// which is how getCurrentCustomer tells them apart and turns them away for
// executives. Ones minted before the sign-in time was added end in the
// marker alone.
const TWO_FACTOR_MARKER = "~2fa";

// Falls back to a fixed dev secret so auth works out of the box locally.
// Set SESSION_SECRET in production to invalidate this default.
function getSecret(): string {
  return process.env.SESSION_SECRET || "vericert-dev-secret-change-me";
}

// A challenge token only says "this browser got the password right for this
// user" and must never work as a session. Signing it under a derived key
// means neither kind of token verifies as the other.
function getChallengeSecret(): string {
  return `${getSecret()}:two-factor-challenge`;
}

export type CustomerSession = {
  userId: string;
  twoFactorVerified: boolean;
  /** When this session's token expires. */
  expiresAt: number;
  /** Two-factor sessions: when the person signed in (absent on older tokens). */
  signedInAt?: number;
};

export type SessionOptions = { twoFactorVerified?: boolean; signedInAt?: number };

export function sessionCookieOptions(ttlMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  };
}

// A customer stays signed in for 30 days from their last visit. A two-factor
// (staff) session lasts only the idle timeout and is extended by
// /api/auth/keepalive while the person is actually using the page, so an
// unattended terminal signs itself out even if the browser tab was closed —
// and never beyond STAFF_SESSION_MAX_MS after they signed in, when the
// password and authenticator are asked for again. Returns 0 once that cap has
// passed.
export function sessionTtlMs(opts: SessionOptions = {}): number {
  if (!opts.twoFactorVerified) return SESSION_TTL_MS;
  const signedInAt = opts.signedInAt ?? Date.now();
  const capLeft = signedInAt + STAFF_SESSION_MAX_MS - Date.now();
  return Math.max(0, Math.min(STAFF_IDLE_TIMEOUT_MS, capLeft));
}

export async function createCustomerSessionToken(userId: string, opts: SessionOptions = {}): Promise<string> {
  const payload = opts.twoFactorVerified
    ? `${userId}${TWO_FACTOR_MARKER}~${opts.signedInAt ?? Date.now()}`
    : userId;
  return createExpiringToken(getSecret(), payload, sessionTtlMs(opts));
}

export async function verifyCustomerSessionToken(
  token: string | undefined
): Promise<CustomerSession | null> {
  const verified = await verifyExpiringTokenWithExpiry(getSecret(), token);
  if (!verified) return null;
  const { payload, expiresAt } = verified;
  const [userId, marker, signedInRaw] = payload.split("~");
  if (`~${marker}` !== TWO_FACTOR_MARKER) return { userId: payload, twoFactorVerified: false, expiresAt };
  const signedInAt = Number(signedInRaw);
  return {
    userId,
    twoFactorVerified: true,
    expiresAt,
    ...(Number.isFinite(signedInAt) && signedInAt > 0 ? { signedInAt } : {}),
  };
}

export async function createTwoFactorChallengeToken(userId: string): Promise<string> {
  return createExpiringToken(getChallengeSecret(), userId, TWO_FACTOR_CHALLENGE_TTL_MS);
}

export async function verifyTwoFactorChallengeToken(
  token: string | undefined
): Promise<string | null> {
  return verifyExpiringToken(getChallengeSecret(), token);
}
