import { getUserByEmail, createUser, updateUser } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import type { Affiliate } from "@/lib/types";

// Longer than the customer-facing 1-hour forgot-password window since this
// is a first-time setup link, not a "someone just requested this" reset.
const SET_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

// Ensures the affiliate can sign in at /partner: creates their customer
// account if none exists yet (with an unusable placeholder password) and
// always issues a fresh "set your password" token, reusing the existing
// reset-password flow/page so there's no new UI to build. Used both when an
// executive directly creates an affiliate and when resending that invite.
export async function issueAffiliateSetPasswordToken(affiliate: Affiliate): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SET_PASSWORD_TTL_MS).toISOString();
  const existing = await getUserByEmail(affiliate.email);

  if (existing) {
    await updateUser(existing.id, { resetToken: token, resetTokenExpiresAt: expiresAt });
    return token;
  }

  const placeholderHash = await hashPassword(generateToken());
  const user = await createUser({
    email: affiliate.email,
    passwordHash: placeholderHash,
    marketingOptIn: false,
    verificationToken: generateToken(),
    verificationTokenExpiresAt: expiresAt,
  });
  await updateUser(user.id, {
    emailVerified: true,
    verificationToken: undefined,
    verificationTokenExpiresAt: undefined,
    resetToken: token,
    resetTokenExpiresAt: expiresAt,
  });

  return token;
}
