import { getUserByEmail, createUser, updateUser } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import type { Affiliate, Customer } from "@/lib/types";

// Longer than the customer-facing 1-hour forgot-password window since this
// is a first-time setup link, not a "someone just requested this" reset.
const SET_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

// Returns the affiliate's customer account, creating it if none exists yet
// with an unusable placeholder password. They get in through a set-password
// link or a sign-in link, never that password.
export async function ensureAffiliateAccount(affiliate: Affiliate): Promise<Customer> {
  const existing = await getUserByEmail(affiliate.email);
  if (existing) return existing;

  const user = await createUser({
    email: affiliate.email,
    passwordHash: await hashPassword(generateToken()),
    marketingConsent: false,
    verificationToken: generateToken(),
    verificationTokenExpiresAt: new Date().toISOString(),
  });
  return (
    (await updateUser(user.id, {
      emailVerified: true,
      verificationToken: undefined,
      verificationTokenExpiresAt: undefined,
    })) ?? user
  );
}

// Ensures the affiliate can sign in at /partner and issues a fresh "set your
// password" token, reusing the existing reset-password flow/page so there's
// no new UI to build. Used both when an executive directly creates an
// affiliate and when resending that invite.
export async function issueAffiliateSetPasswordToken(affiliate: Affiliate): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SET_PASSWORD_TTL_MS).toISOString();
  const user = await ensureAffiliateAccount(affiliate);
  await updateUser(user.id, { resetToken: token, resetTokenExpiresAt: expiresAt });
  return token;
}
