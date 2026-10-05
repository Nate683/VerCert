import { createExpiringToken, verifyExpiringToken } from "@/lib/signed-token";

// Lets someone who isn't signed in view an order after proving they know both
// its reference and the email it was placed with (/order-status). The cookie
// holds the references unlocked in this browser, HMAC-signed under a key of
// its own so it can never pass as a session token.
export const ORDER_ACCESS_COOKIE = "vericert_order_access";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REFERENCES = 10;

function secret(): string {
  return `${process.env.SESSION_SECRET || "vericert-dev-secret-change-me"}:order-access`;
}

export async function referencesFromCookie(token: string | undefined): Promise<string[]> {
  const payload = await verifyExpiringToken(secret(), token);
  return payload ? payload.split(",").filter(Boolean) : [];
}

// Adds a reference to whatever this browser already holds; the most recent
// ten are kept.
export async function grantOrderAccess(existingToken: string | undefined, reference: string): Promise<string> {
  const refs = (await referencesFromCookie(existingToken)).filter((r) => r !== reference);
  const next = [...refs, reference].slice(-MAX_REFERENCES);
  return createExpiringToken(secret(), next.join(","), TTL_MS);
}

export const orderAccessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: TTL_MS / 1000,
};
