import { createExpiringToken, verifyExpiringToken } from "@/lib/signed-token";

export type ExecutiveRealm = "command" | "office";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const COOKIE_NAMES: Record<ExecutiveRealm, string> = {
  command: "vericert_command_session",
  office: "vericert_office_session",
};

const ENV_VARS: Record<ExecutiveRealm, string> = {
  command: "COMMAND_PASSWORD",
  office: "OFFICE_PASSWORD",
};

export function getExecutiveCookieName(realm: ExecutiveRealm): string {
  return COOKIE_NAMES[realm];
}

function getRealmPassword(realm: ExecutiveRealm): string | undefined {
  // Trim to tolerate accidental leading/trailing whitespace in .env.local.
  const raw = process.env[ENV_VARS[realm]];
  return raw?.trim() || undefined;
}

// Each realm signs its session with its own password so revoking one
// (rotating its env var) never affects the other terminal's sessions.
export async function createExecutiveSessionToken(realm: ExecutiveRealm): Promise<string> {
  const secret = getRealmPassword(realm) ?? "";
  return createExpiringToken(`vericert-${realm}:${secret}`, realm, SESSION_TTL_MS);
}

export async function verifyExecutiveSessionToken(
  realm: ExecutiveRealm,
  token: string | undefined
): Promise<boolean> {
  const secret = getRealmPassword(realm);
  if (!secret || !token) return false;
  const payload = await verifyExpiringToken(`vericert-${realm}:${secret}`, token);
  return payload === realm;
}

export function verifyExecutivePassword(realm: ExecutiveRealm, password: string): boolean {
  const expected = getRealmPassword(realm);
  if (!expected) return false;
  if (password.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// The shared data API accepts either terminal's session — same underlying
// data, independently revocable logins.
export async function verifyAnyExecutiveSession(tokens: {
  command?: string;
  office?: string;
}): Promise<boolean> {
  if (await verifyExecutiveSessionToken("command", tokens.command)) return true;
  if (await verifyExecutiveSessionToken("office", tokens.office)) return true;
  return false;
}
