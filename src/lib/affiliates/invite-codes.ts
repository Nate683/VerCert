import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { AffiliateInviteCode, AffiliateTier } from "@/lib/types";

// Server-only Postgres-backed store for single-use affiliate invite codes
// generated from /command. Redeeming one at /signup creates the affiliate
// account instantly (no approval queue) — the code text itself becomes the
// affiliate's permanent referral/promo code.

type InviteCodeRow = {
  id: string;
  code: string;
  bound_email: string | null;
  tier: AffiliateTier;
  customer_discount_percent: number;
  used_by_affiliate_id: string | null;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
};

function rowToInviteCode(row: InviteCodeRow): AffiliateInviteCode {
  return {
    id: row.id,
    code: row.code,
    boundEmail: row.bound_email ?? undefined,
    tier: row.tier,
    customerDiscountPercent: row.customer_discount_percent,
    usedByAffiliateId: row.used_by_affiliate_id ?? undefined,
    usedAt: row.used_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

const SELECT_ALL = "SELECT * FROM affiliate_invite_codes";

export async function listInviteCodes(): Promise<AffiliateInviteCode[]> {
  const rows = await query<InviteCodeRow>(`${SELECT_ALL} ORDER BY created_at DESC`);
  return rows.map(rowToInviteCode);
}

export async function getInviteCodeByCode(code: string): Promise<AffiliateInviteCode | null> {
  const rows = await query<InviteCodeRow>(`${SELECT_ALL} WHERE code = $1`, [code.toUpperCase()]);
  return rows[0] ? rowToInviteCode(rows[0]) : null;
}

export type CreateInviteCodeInput = {
  code: string;
  boundEmail?: string;
  tier: AffiliateTier;
  customerDiscountPercent?: number;
  createdBy?: string;
};

export async function createInviteCode(input: CreateInviteCodeInput): Promise<AffiliateInviteCode> {
  if (await getInviteCodeByCode(input.code)) {
    throw new Error("An invite code with this text already exists.");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO affiliate_invite_codes
      (id, code, bound_email, tier, customer_discount_percent, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.code.toUpperCase(),
      input.boundEmail?.toLowerCase() ?? null,
      input.tier,
      input.customerDiscountPercent ?? 0,
      input.createdBy ?? null,
      now,
    ]
  );
  const created = await getInviteCodeByCode(input.code);
  if (!created) throw new Error("Failed to create invite code.");
  return created;
}

export async function deleteInviteCode(id: string): Promise<void> {
  await query("DELETE FROM affiliate_invite_codes WHERE id = $1", [id]);
}

export async function markInviteCodeUsed(id: string, affiliateId: string): Promise<void> {
  await query(
    "UPDATE affiliate_invite_codes SET used_by_affiliate_id = $2, used_at = $3 WHERE id = $1",
    [id, affiliateId, new Date().toISOString()]
  );
}
