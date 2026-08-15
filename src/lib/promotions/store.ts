import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { PromoCode, PromoCodeStats, PromoType } from "@/lib/types";

// Server-only Postgres-backed promo code store + redemption ledger.

type PromoCodeRow = {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  min_order_amount: number;
  usage_limit: number | null;
  per_customer_limit: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  restricted_product_slugs: string | null;
  restricted_categories: string | null;
  created_at: string;
  updated_at: string;
};

function rowToPromoCode(row: PromoCodeRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    minOrderAmount: row.min_order_amount,
    usageLimit: row.usage_limit ?? undefined,
    perCustomerLimit: row.per_customer_limit ?? undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    active: row.active,
    restrictedProductSlugs: row.restricted_product_slugs
      ? JSON.parse(row.restricted_product_slugs)
      : undefined,
    restrictedCategories: row.restricted_categories
      ? JSON.parse(row.restricted_categories)
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_ALL = "SELECT * FROM promo_codes";

export async function listPromoCodes(): Promise<PromoCode[]> {
  const rows = await query<PromoCodeRow>(`${SELECT_ALL} ORDER BY created_at DESC`);
  return rows.map(rowToPromoCode);
}

export async function getPromoCodeById(id: string): Promise<PromoCode | null> {
  const rows = await query<PromoCodeRow>(`${SELECT_ALL} WHERE id = $1`, [id]);
  return rows[0] ? rowToPromoCode(rows[0]) : null;
}

export async function getPromoCodeByCode(code: string): Promise<PromoCode | null> {
  const rows = await query<PromoCodeRow>(`${SELECT_ALL} WHERE code = $1`, [code.toUpperCase()]);
  return rows[0] ? rowToPromoCode(rows[0]) : null;
}

export type CreatePromoCodeInput = {
  code: string;
  type: PromoType;
  value: number;
  minOrderAmount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  startsAt?: string;
  endsAt?: string;
  active?: boolean;
  restrictedProductSlugs?: string[];
  restrictedCategories?: string[];
};

export async function createPromoCode(input: CreatePromoCodeInput): Promise<PromoCode> {
  const now = new Date().toISOString();
  const id = randomUUID();
  await query(
    `INSERT INTO promo_codes
      (id, code, type, value, min_order_amount, usage_limit, per_customer_limit, starts_at, ends_at, active, restricted_product_slugs, restricted_categories, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      input.code.toUpperCase(),
      input.type,
      input.value,
      input.minOrderAmount ?? 0,
      input.usageLimit ?? null,
      input.perCustomerLimit ?? null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.active ?? true,
      input.restrictedProductSlugs ? JSON.stringify(input.restrictedProductSlugs) : null,
      input.restrictedCategories ? JSON.stringify(input.restrictedCategories) : null,
      now,
      now,
    ]
  );
  const created = await getPromoCodeById(id);
  if (!created) throw new Error("Failed to create promo code.");
  return created;
}

const PATCHABLE_COLUMNS: Record<string, string> = {
  code: "code",
  type: "type",
  value: "value",
  minOrderAmount: "min_order_amount",
  usageLimit: "usage_limit",
  perCustomerLimit: "per_customer_limit",
  startsAt: "starts_at",
  endsAt: "ends_at",
  active: "active",
  restrictedProductSlugs: "restricted_product_slugs",
  restrictedCategories: "restricted_categories",
};

const JSON_FIELDS = new Set(["restrictedProductSlugs", "restrictedCategories"]);

export async function updatePromoCode(
  id: string,
  patch: Partial<PromoCode>
): Promise<PromoCode | null> {
  const fields = Object.keys(PATCHABLE_COLUMNS).filter((f) => f in patch);
  if (fields.length > 0) {
    const values: unknown[] = [id];
    const assignments = fields.map((field, i) => {
      let value = (patch as Record<string, unknown>)[field];
      if (field === "code" && typeof value === "string") value = value.toUpperCase();
      values.push(
        value === undefined ? null : JSON_FIELDS.has(field) ? JSON.stringify(value) : value
      );
      return `${PATCHABLE_COLUMNS[field]} = $${i + 2}`;
    });
    values.push(new Date().toISOString());
    await query(
      `UPDATE promo_codes SET ${assignments.join(", ")}, updated_at = $${values.length} WHERE id = $1`,
      values
    );
  }
  return getPromoCodeById(id);
}

export async function deletePromoCode(id: string): Promise<void> {
  await query("DELETE FROM promo_codes WHERE id = $1", [id]);
}

// --- Redemption ledger ---
// Usage/limit checks and stats are derived from this ledger (never a mutable
// counter column) so a rolled-back redemption (order cancelled) stays accurate.

export async function countRedemptions(promoId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM promo_redemptions WHERE promo_code_id = $1",
    [promoId]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countCustomerRedemptions(
  promoId: string,
  customerId: string
): Promise<number> {
  const rows = await query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM promo_redemptions WHERE promo_code_id = $1 AND customer_id = $2",
    [promoId, customerId]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function recordRedemption(input: {
  promoCodeId: string;
  orderId: string;
  customerId?: string;
  discountAmount: number;
}): Promise<void> {
  await query(
    `INSERT INTO promo_redemptions (id, promo_code_id, order_id, customer_id, discount_amount, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (order_id) DO NOTHING`,
    [
      randomUUID(),
      input.promoCodeId,
      input.orderId,
      input.customerId ?? null,
      input.discountAmount,
      new Date().toISOString(),
    ]
  );
}

export async function removeRedemptionForOrder(orderId: string): Promise<void> {
  await query("DELETE FROM promo_redemptions WHERE order_id = $1", [orderId]);
}

async function getPromoCodeStats(promoId: string) {
  const rows = await query<{ redemptions: number; revenue: number | null; discount: number | null }>(
    `SELECT COUNT(*)::int AS redemptions, COALESCE(SUM(o.total), 0) AS revenue, COALESCE(SUM(r.discount_amount), 0) AS discount
     FROM promo_redemptions r
     JOIN orders o ON o.id = r.order_id
     WHERE r.promo_code_id = $1`,
    [promoId]
  );
  const row = rows[0];
  return {
    redemptions: Number(row?.redemptions ?? 0),
    revenueAttributed: Number(row?.revenue ?? 0),
    discountGiven: Number(row?.discount ?? 0),
  };
}

export async function listPromoCodesWithStats(): Promise<PromoCodeStats[]> {
  const codes = await listPromoCodes();
  return Promise.all(
    codes.map(async (code) => ({ ...code, ...(await getPromoCodeStats(code.id)) }))
  );
}
