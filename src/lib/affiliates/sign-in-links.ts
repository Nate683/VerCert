import { createHash, randomBytes, randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getUserById } from "@/lib/users/store";
import { getSiteUrl } from "@/lib/site-url";
import type { Affiliate, Customer } from "@/lib/types";
import { ensureAffiliateAccount } from "./access";
import { getAffiliateById } from "./store";

// A sign-in link is a credential an executive copies out of /command and
// texts to an affiliate. It works once, for SIGN_IN_LINK_TTL_MS, and only the
// SHA-256 of its token is stored, so a database read can't be turned into a
// working link.
const SIGN_IN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class SignInLinkError extends Error {}

export type SignInLink = { url: string; expiresAt: string };

// Makes a new link for the affiliate, creating their account first if they
// don't have one, and deletes any unused link they had: only the newest one
// works. Executive accounts never get one — they always sign in with a
// password and two-factor.
export async function createAffiliateSignInLink(
  affiliate: Affiliate,
  createdBy?: string
): Promise<SignInLink> {
  if (!affiliate.active) throw new SignInLinkError("This affiliate is inactive. Activate them first.");
  const user = await ensureAffiliateAccount(affiliate);
  if (user.role) throw new SignInLinkError("Executive accounts can't use sign-in links.");

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SIGN_IN_LINK_TTL_MS).toISOString();

  await query("DELETE FROM sign_in_links WHERE affiliate_id = $1 AND used_at IS NULL", [affiliate.id]);
  await query(
    `INSERT INTO sign_in_links (id, token_hash, user_id, affiliate_id, created_by, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), hashToken(token), user.id, affiliate.id, createdBy ?? null, now.toISOString(), expiresAt]
  );

  const url = new URL("/partner/start", getSiteUrl());
  url.searchParams.set("token", token);
  return { url: url.toString(), expiresAt };
}

export type SignInLinkState = "valid" | "used" | "expired" | "invalid";

// Read-only, so the landing page can say whether a link still works without
// spending it — message apps fetch links to build previews, and that must
// never use one up.
export async function checkSignInLink(token: string): Promise<SignInLinkState> {
  if (!token) return "invalid";
  const rows = await query<{ expires_at: string; used_at: string | null }>(
    "SELECT expires_at, used_at FROM sign_in_links WHERE token_hash = $1",
    [hashToken(token)]
  );
  const link = rows[0];
  if (!link) return "invalid";
  if (link.used_at) return "used";
  return new Date(link.expires_at).getTime() < Date.now() ? "expired" : "valid";
}

// Spends the link and returns the account it signs in. The UPDATE claims it
// atomically, so two clicks racing each other can't both succeed. A link
// whose affiliate has since been deactivated, deleted or moved to another
// email address signs nobody in.
export async function redeemSignInLink(token: string): Promise<Customer | null> {
  if (!token) return null;
  const now = new Date().toISOString();
  const claimed = await query<{ user_id: string; affiliate_id: string }>(
    `UPDATE sign_in_links SET used_at = $2
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
      RETURNING user_id, affiliate_id`,
    [hashToken(token), now]
  );
  if (!claimed[0]) return null;

  const [user, affiliate] = await Promise.all([
    getUserById(claimed[0].user_id),
    getAffiliateById(claimed[0].affiliate_id),
  ]);
  if (!user || user.role || !affiliate?.active) return null;
  if (affiliate.email.toLowerCase() !== user.email.toLowerCase()) return null;
  return user;
}
