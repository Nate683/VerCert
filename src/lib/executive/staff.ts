import { getUserByEmail, createUser, updateUser } from "@/lib/users/store";
import { hashPassword, verifyPassword, generateToken } from "@/lib/users/password";
import type { Customer } from "@/lib/types";

export type ExecutiveRealm = "command" | "office";

// Real people who get the executive dashboard layered on top of their normal
// storefront login (email + password) — no separate password gate. Sign in
// at /login like any customer; the dashboard link appears automatically.
const STAFF_EMAILS: Record<ExecutiveRealm, string> = {
  command: "nate.robson0@gmail.com",
  office: "ryancalpacific@aol.com",
};

// Seeds each staff account's password on first-ever login, so they don't need
// a separate signup step. They can change it via forgot-password afterward
// like anyone else.
//
// Editing one of these after that first login also resets the account — see
// ensureStaffAccount. That makes the env var the recovery path for a locked
// out executive. It used to be read only when creating the row, so once the
// account existed the variable was inert: changing it looked like it should
// work, silently did nothing, and left no way back in short of editing the
// database by hand.
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

// staff_seed_hash ships in a migration. If this code runs against a database
// where `npm run db:migrate` has not been applied, writing that column fails —
// degrade to the rest of the patch rather than returning a 500. A stale seed
// is recoverable; an executive who cannot log in at all is the exact failure
// this file exists to prevent.
async function applyPatch(
  id: string,
  patch: Partial<Customer>,
  fallback: Customer
): Promise<Customer> {
  try {
    return (await updateUser(id, patch)) ?? fallback;
  } catch (err) {
    if (patch.staffSeedHash === undefined) throw err;
    console.error("[staff] could not write staff_seed_hash — run `npm run db:migrate`.", err);
    const rest: Partial<Customer> = {};
    if (patch.role !== undefined) rest.role = patch.role;
    if (patch.emailVerified !== undefined) rest.emailVerified = patch.emailVerified;
    if (Object.keys(rest).length === 0) return fallback;
    return (await updateUser(id, rest)) ?? fallback;
  }
}

export async function ensureStaffAccount(realm: ExecutiveRealm): Promise<Customer | null> {
  const email = STAFF_EMAILS[realm];
  const envVar = SEED_PASSWORD_ENV_VARS[realm];
  const seedPassword = process.env[envVar]?.trim() || undefined;
  const existing = await getUserByEmail(email);

  if (!existing) {
    if (!seedPassword) return null;
    const created = await createUser({
      email,
      passwordHash: await hashPassword(seedPassword),
      marketingOptIn: false,
      verificationToken: generateToken(),
      verificationTokenExpiresAt: new Date().toISOString(),
    });
    return applyPatch(
      created.id,
      { emailVerified: true, role: realm, staffSeedHash: await hashPassword(seedPassword) },
      created
    );
  }

  const patch: Partial<Customer> = {};
  if (existing.role !== realm) patch.role = realm;

  // staffSeedHash records which seed value was last applied, so a changed env
  // var can be told apart from a password the owner set themselves. It is a
  // salted scrypt hash like passwordHash — the plaintext seed is never stored.
  if (seedPassword) {
    if (!existing.staffSeedHash) {
      // Row predates this tracking. Record the current value as the baseline
      // and leave the password alone: the account may already carry a password
      // its owner chose via forgot-password, and overwriting that silently
      // would be a worse failure than the staleness this fixes.
      patch.staffSeedHash = await hashPassword(seedPassword);
    } else if (!(await verifyPassword(seedPassword, existing.staffSeedHash))) {
      // The env var changed since it was last applied. Treat that as a
      // deliberate request to reset this account.
      patch.passwordHash = await hashPassword(seedPassword);
      patch.staffSeedHash = await hashPassword(seedPassword);
      console.warn(`[staff] ${envVar} changed — reset the password for ${email}.`);
    }
  }

  if (Object.keys(patch).length === 0) return existing;
  return applyPatch(existing.id, patch, existing);
}
