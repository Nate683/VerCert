import { createExpiringToken, verifyExpiringToken } from "@/lib/signed-token";

export const CUSTOMER_SESSION_COOKIE = "vericert_customer_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const TWO_FACTOR_CHALLENGE_COOKIE = "vericert_2fa_challenge";
export const TWO_FACTOR_CHALLENGE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Appended to the signed payload of a session that passed two-factor.
// Sessions minted before 2FA existed don't carry it, which is how
// getCurrentCustomer tells them apart and turns them away for executives.
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

export type CustomerSession = { userId: string; twoFactorVerified: boolean };

export async function createCustomerSessionToken(
  userId: string,
  opts: { twoFactorVerified?: boolean } = {}
): Promise<string> {
  const payload = opts.twoFactorVerified ? `${userId}${TWO_FACTOR_MARKER}` : userId;
  return createExpiringToken(getSecret(), payload, SESSION_TTL_MS);
}

export async function verifyCustomerSessionToken(
  token: string | undefined
): Promise<CustomerSession | null> {
  const payload = await verifyExpiringToken(getSecret(), token);
  if (!payload) return null;
  const twoFactorVerified = payload.endsWith(TWO_FACTOR_MARKER);
  return {
    userId: twoFactorVerified ? payload.slice(0, -TWO_FACTOR_MARKER.length) : payload,
    twoFactorVerified,
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
