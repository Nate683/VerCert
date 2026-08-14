import { getUserByEmail, createUser, updateUser } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import type { Customer } from "@/lib/types";

export type ExecutiveRealm = "command" | "office";

// Real people who get the executive dashboard layered on top of their normal
// storefront login (email + password) — no separate password gate. Sign in
// at /login like any customer; the dashboard link appears automatically.
const STAFF_EMAILS: Record<ExecutiveRealm, string> = {
  command: "nate.robson0@gmail.com",
  office: "ryancalpacific@aol.com",
};

// Seeds each staff account's initial password on first-ever login, so they
// don't need a separate signup step. They can change it via forgot-password
// afterward like anyone else.
const SEED_PASSWORD_ENV_VARS: Record<ExecutiveRealm, string> = {
  command: "COMMAND_PASSWORD",
  office: "OFFICE_PASSWORD",
};

export function getRealmForEmail(email: string): ExecutiveRealm | null {
  const normalized = email.trim().toLowerCase();
  return (
    (Object.keys(STAFF_EMAILS) as ExecutiveRealm[]).find(
      (realm) => STAFF_EMAILS[realm] === normalized
    ) ?? null
  );
}

export async function ensureStaffAccount(realm: ExecutiveRealm): Promise<Customer | null> {
  const email = STAFF_EMAILS[realm];
  const existing = await getUserByEmail(email);
  if (existing) {
    if (existing.role === realm) return existing;
    return (await updateUser(existing.id, { role: realm })) ?? existing;
  }

  const seedPassword = process.env[SEED_PASSWORD_ENV_VARS[realm]]?.trim();
  if (!seedPassword) return null;

  const passwordHash = await hashPassword(seedPassword);
  const created = await createUser({
    email,
    passwordHash,
    marketingOptIn: false,
    verificationToken: generateToken(),
    verificationTokenExpiresAt: new Date().toISOString(),
  });
  return (await updateUser(created.id, { emailVerified: true, role: realm })) ?? created;
}
