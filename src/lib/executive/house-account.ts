import { getUserByEmail, createUser, updateUser } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import type { Customer } from "@/lib/types";
import type { ExecutiveRealm } from "./auth";

// Reserved storefront identities used to give each executive a normal
// shopping session while they're signed into their terminal. These emails
// can never be used for public signup (see api/auth/signup) and have an
// unguessable, never-revealed password, so they're only ever reachable via
// a successful /command or /office login — never the customer /login form.
export const HOUSE_ACCOUNT_EMAILS: Record<ExecutiveRealm, string> = {
  command: "nate@vericert.internal",
  office: "ryan@vericert.internal",
};

export function isHouseAccountEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return Object.values(HOUSE_ACCOUNT_EMAILS).includes(normalized);
}

export async function getOrCreateHouseAccount(realm: ExecutiveRealm): Promise<Customer> {
  const email = HOUSE_ACCOUNT_EMAILS[realm];
  const existing = await getUserByEmail(email);
  if (existing) return existing;

  const passwordHash = await hashPassword(generateToken());
  const created = await createUser({
    email,
    passwordHash,
    marketingOptIn: false,
    verificationToken: generateToken(),
    verificationTokenExpiresAt: new Date().toISOString(),
  });

  const verified = await updateUser(created.id, { emailVerified: true });
  return verified ?? created;
}
