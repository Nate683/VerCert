import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { Affiliate, AffiliatePayout, AffiliateTier, CommissionType } from "@/lib/types";
import { createPromoCode, deletePromoCode, getPromoCodeByCode, updatePromoCode } from "@/lib/promotions";

// Server-only Postgres-backed affiliate store. Each affiliate is backed by
// a real promo code (created/kept in sync here) so attribution reuses the
// exact same validated-at-checkout mechanism as any other promo code.

type AffiliateRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  payment_method: string | null;
  notes: string | null;
  commission_type: CommissionType;
  commission_rate: number;
  commission_flat_amount: number;
  promo_code_id: string | null;
  portal_code: string | null;
  tier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

// Excludes visually ambiguous characters (0/O, 1/I) since affiliates read
// this off a screen and type it back in at login.
function generatePortalCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function rowToAffiliate(row: AffiliateRow): Affiliate {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    notes: row.notes ?? undefined,
    commissionType: row.commission_type,
    commissionRate: row.commission_rate,
    commissionFlatAmount: row.commission_flat_amount,
    promoCodeId: row.promo_code_id ?? undefined,
    portalCode: row.portal_code ?? undefined,
    tier: (row.tier as AffiliateTier | null) ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_ALL = "SELECT * FROM affiliates";

export async function listAffiliates(): Promise<Affiliate[]> {
  const rows = await query<AffiliateRow>(`${SELECT_ALL} ORDER BY created_at DESC`);
  return rows.map(rowToAffiliate);
}

export async function getAffiliateById(id: string): Promise<Affiliate | null> {
  const rows = await query<AffiliateRow>(`${SELECT_ALL} WHERE id = $1`, [id]);
  return rows[0] ? rowToAffiliate(rows[0]) : null;
}

export async function getAffiliateByEmail(email: string): Promise<Affiliate | null> {
  const rows = await query<AffiliateRow>(`${SELECT_ALL} WHERE lower(email) = lower($1)`, [email]);
  return rows[0] ? rowToAffiliate(rows[0]) : null;
}

export type CreateAffiliateInput = {
  name: string;
  email: string;
  phone?: string;
  paymentMethod?: string;
  notes?: string;
  commissionType: CommissionType;
  commissionRate?: number;
  commissionFlatAmount?: number;
  code: string;
  customerDiscountPercent?: number;
  tier?: AffiliateTier;
};

// Creates the affiliate and its linked promo code together. The promo code
// gives the customer `customerDiscountPercent` off (0 = tracking-only code,
// no customer-facing discount) and is what attributes orders to this affiliate.
export async function createAffiliate(input: CreateAffiliateInput): Promise<Affiliate> {
  if (await getPromoCodeByCode(input.code)) {
    throw new Error("A promo code with this code already exists.");
  }

  const promo = await createPromoCode({
    code: input.code,
    type: "percent",
    value: input.customerDiscountPercent ?? 0,
    active: true,
  });

  const now = new Date().toISOString();
  const id = randomUUID();
  await query(
    `INSERT INTO affiliates
      (id, name, email, phone, payment_method, notes, commission_type, commission_rate, commission_flat_amount, promo_code_id, portal_code, tier, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      input.name,
      input.email,
      input.phone ?? null,
      input.paymentMethod ?? null,
      input.notes ?? null,
      input.commissionType,
      input.commissionRate ?? 0,
      input.commissionFlatAmount ?? 0,
      promo.id,
      generatePortalCode(),
      input.tier ?? null,
      true,
      now,
      now,
    ]
  );

  await updatePromoCode(promo.id, { affiliateId: id });
  const created = await getAffiliateById(id);
  if (!created) throw new Error("Failed to create affiliate.");
  return created;
}

const PATCHABLE_COLUMNS: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  paymentMethod: "payment_method",
  notes: "notes",
  commissionType: "commission_type",
  commissionRate: "commission_rate",
  commissionFlatAmount: "commission_flat_amount",
  portalCode: "portal_code",
  tier: "tier",
  active: "active",
};

export async function updateAffiliate(
  id: string,
  patch: Partial<Affiliate>
): Promise<Affiliate | null> {
  const fields = Object.keys(PATCHABLE_COLUMNS).filter((f) => f in patch);
  if (fields.length > 0) {
    const values: unknown[] = [id];
    const assignments = fields.map((field, i) => {
      const value = (patch as Record<string, unknown>)[field];
      values.push(value === undefined ? null : value);
      return `${PATCHABLE_COLUMNS[field]} = $${i + 2}`;
    });
    values.push(new Date().toISOString());
    await query(
      `UPDATE affiliates SET ${assignments.join(", ")}, updated_at = $${values.length} WHERE id = $1`,
      values
    );
  }
  return getAffiliateById(id);
}

export async function regeneratePortalCode(id: string): Promise<Affiliate | null> {
  return updateAffiliate(id, { portalCode: generatePortalCode() });
}

export async function deleteAffiliate(id: string): Promise<void> {
  const affiliate = await getAffiliateById(id);
  await query("DELETE FROM affiliate_payouts WHERE affiliate_id = $1", [id]);
  await query("DELETE FROM affiliates WHERE id = $1", [id]);
  if (affiliate?.promoCodeId) await deletePromoCode(affiliate.promoCodeId).catch(() => undefined);
}

// --- Commission payout ledger ---

export async function listPayouts(affiliateId: string): Promise<AffiliatePayout[]> {
  const rows = await query<{
    id: string;
    affiliate_id: string;
    amount: number;
    paid_at: string;
    note: string | null;
    created_at: string;
  }>("SELECT * FROM affiliate_payouts WHERE affiliate_id = $1 ORDER BY paid_at DESC", [affiliateId]);
  return rows.map((r) => ({
    id: r.id,
    affiliateId: r.affiliate_id,
    amount: r.amount,
    paidAt: r.paid_at,
    note: r.note ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function recordPayout(input: {
  affiliateId: string;
  amount: number;
  paidAt: string;
  note?: string;
}): Promise<AffiliatePayout> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO affiliate_payouts (id, affiliate_id, amount, paid_at, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.affiliateId, input.amount, input.paidAt, input.note ?? null, createdAt]
  );
  return { id, affiliateId: input.affiliateId, amount: input.amount, paidAt: input.paidAt, note: input.note, createdAt };
}

export async function getAllPayouts(): Promise<AffiliatePayout[]> {
  const rows = await query<{
    id: string;
    affiliate_id: string;
    amount: number;
    paid_at: string;
    note: string | null;
    created_at: string;
  }>("SELECT * FROM affiliate_payouts");
  return rows.map((r) => ({
    id: r.id,
    affiliateId: r.affiliate_id,
    amount: r.amount,
    paidAt: r.paid_at,
    note: r.note ?? undefined,
    createdAt: r.created_at,
  }));
}
