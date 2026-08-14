import { createExpiringToken, verifyExpiringToken } from "@/lib/signed-token";

export const CUSTOMER_SESSION_COOKIE = "vericert_customer_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Falls back to a fixed dev secret so auth works out of the box locally.
// Set SESSION_SECRET in production to invalidate this default.
function getSecret(): string {
  return process.env.SESSION_SECRET || "vericert-dev-secret-change-me";
}

export async function createCustomerSessionToken(userId: string): Promise<string> {
  return createExpiringToken(getSecret(), userId, SESSION_TTL_MS);
}

export async function verifyCustomerSessionToken(
  token: string | undefined
): Promise<string | null> {
  return verifyExpiringToken(getSecret(), token);
}
