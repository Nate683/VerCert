import { randomUUID } from "crypto";
import { query, transaction } from "@/lib/db";
import type { CartItem, CustomerInfo, FulfillmentStatus, Order, OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";
import { generateOrderReference } from "./reference";

// Server-only Postgres-backed order store. Exported function signatures are
// unchanged from earlier versions so every API route/page that already
// awaits these keeps working as-is.

type OrderRow = {
  id: string;
  reference: string;
  created_at: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  customer_id: string | null;
  customer: string;
  items: string;
  subtotal: number;
  total: number;
  crypto: string | null;
  paid_at: string | null;
  processing_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  carrier: string | null;
  tracking_number: string | null;
  stock_decremented: boolean;
  promo_code: string | null;
  promo_code_id: string | null;
  discount_amount: number;
  free_shipping: boolean;
  refunded_at: string | null;
  refund_reason: string | null;
  refund_amount: number | null;
  research_attestation: string | null;
  research_attested_at: string | null;
  research_attested_ip: string | null;
  subscription_id: string | null;
  affiliate_id: string | null;
  self_purchase: boolean | null | string;
  payment_status?: PaymentStatus | null;
  fulfillment_status?: FulfillmentStatus | null;
  reservation_expires_at?: string | null;
  payment_reference?: string | null;
  payment_amount_received?: number | string | null;
  payment_received_on?: string | null;
  payment_confirmed_by?: string | null;
  payment_confirmed_at?: string | null;
  payment_source?: Order["paymentSource"] | null;
  needs_review?: boolean | string | null;
  review_reason?: string | null;
  review_opened_at?: string | null;
  returned_at?: string | null;
};

const truthy = (v: unknown) => v === true || v === "t" || v === "true";

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    reference: row.reference,
    createdAt: row.created_at,
    status: row.status,
    paymentMethod: row.payment_method,
    customerId: row.customer_id ?? undefined,
    customer: JSON.parse(row.customer) as CustomerInfo,
    items: JSON.parse(row.items) as CartItem[],
    subtotal: row.subtotal,
    total: row.total,
    crypto: row.crypto ? JSON.parse(row.crypto) : undefined,
    paidAt: row.paid_at ?? undefined,
    processingAt: row.processing_at ?? undefined,
    shippedAt: row.shipped_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
    carrier: row.carrier ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    stockDecremented: Boolean(row.stock_decremented),
    promoCode: row.promo_code ?? undefined,
    promoCodeId: row.promo_code_id ?? undefined,
    discountAmount: row.discount_amount,
    freeShipping: Boolean(row.free_shipping),
    refundedAt: row.refunded_at ?? undefined,
    refundReason: (row.refund_reason as Order["refundReason"]) ?? undefined,
    refundAmount: row.refund_amount ?? undefined,
    researchAttestation:
      row.research_attestation && row.research_attested_at
        ? { text: row.research_attestation, at: row.research_attested_at, ip: row.research_attested_ip ?? undefined }
        : undefined,
    subscriptionId: row.subscription_id ?? undefined,
    affiliateId: row.affiliate_id ?? undefined,
    selfPurchase: truthy(row.self_purchase) ? true : undefined,
    paymentStatus: row.payment_status ?? undefined,
    fulfillmentStatus: row.fulfillment_status ?? undefined,
    reservationExpiresAt: row.reservation_expires_at ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    paymentAmountReceived: row.payment_amount_received === null || row.payment_amount_received === undefined ? undefined : Number(row.payment_amount_received),
    paymentReceivedOn: row.payment_received_on ?? undefined,
    paymentConfirmedBy: row.payment_confirmed_by ?? undefined,
    paymentConfirmedAt: row.payment_confirmed_at ?? undefined,
    paymentSource: row.payment_source ?? undefined,
    needsReview: truthy(row.needs_review),
    reviewReason: row.review_reason ?? undefined,
    reviewOpenedAt: row.review_opened_at ?? undefined,
    returnedAt: row.returned_at ?? undefined,
  };
}

const SELECT_ALL = "SELECT * FROM orders";

export type CreateOrderInput = {
  paymentMethod: PaymentMethod;
  customerId?: string;
  customer: CustomerInfo;
  items: CartItem[];
  subtotal: number;
  total: number;
  status: OrderStatus;
  promoCode?: string;
  promoCodeId?: string;
  discountAmount?: number;
  freeShipping?: boolean;
  researchAttestation?: Order["researchAttestation"];
  subscriptionId?: string;
  affiliateId?: string;
  selfPurchase?: boolean;
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  return (await createOrderAtomic(input)).order;
}

export class DuplicateOrderAttempt extends Error {
  constructor(readonly existing: Order) {
    super("This checkout was already submitted.");
  }
}

// Stage 3. Inserts the order and — for a reserving payment method — reserves its stock, in ONE transaction: if the
// reservation is refused (not enough sellable stock) the order is not created either. A repeated checkout attempt
// (same idempotency key) creates nothing and returns the order the first attempt created.
export async function createOrderAtomic(
  input: CreateOrderInput,
  opts: { idempotencyKey?: string; reserve?: { expiresAt: string; actor: string } } = {}
): Promise<{ order: Order; duplicate: boolean }> {
  if (opts.idempotencyKey) {
    const existing = await getOrderByIdempotencyKey(opts.idempotencyKey);
    if (existing) return { order: existing, duplicate: true };
  }
  const order: Order = {
    id: randomUUID(),
    reference: generateOrderReference(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  const insert = buildInsert(order, opts.idempotencyKey);
  try {
    await transaction([
      insert,
      ...(opts.reserve ? [{ text: "SELECT vc_order_reserve($1, $2, $3)", params: [order.id, opts.reserve.expiresAt, opts.reserve.actor] }] : []),
    ]);
  } catch (err) {
    const e = err as { code?: string; message?: string; constraint?: string };
    if (opts.idempotencyKey && e.code === "23505" && /idempotency/.test(`${e.constraint ?? ""} ${e.message ?? ""}`)) {
      const existing = await getOrderByIdempotencyKey(opts.idempotencyKey);
      if (existing) return { order: existing, duplicate: true };
    }
    throw err;
  }
  return { order: (await getOrderById(order.id)) ?? order, duplicate: false };
}

export async function getOrderByIdempotencyKey(key: string): Promise<Order | null> {
  const rows = await query<OrderRow>(`${SELECT_ALL} WHERE idempotency_key = $1`, [key]);
  return rows[0] ? rowToOrder(rows[0]) : null;
}

function buildInsert(order: Order, idempotencyKey?: string): { text: string; params: unknown[] } {
  return {
    text: `INSERT INTO orders
      (id, reference, created_at, status, payment_method, customer_id, customer, items, subtotal, total, promo_code, promo_code_id, discount_amount, free_shipping,
       research_attestation, research_attested_at, research_attested_ip, subscription_id, affiliate_id, self_purchase, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    params: [
      order.id,
      order.reference,
      order.createdAt,
      order.status,
      order.paymentMethod,
      order.customerId ?? null,
      JSON.stringify(order.customer),
      JSON.stringify(order.items),
      order.subtotal,
      order.total,
      order.promoCode ?? null,
      order.promoCodeId ?? null,
      order.discountAmount ?? 0,
      order.freeShipping ?? false,
      order.researchAttestation?.text ?? null,
      order.researchAttestation?.at ?? null,
      order.researchAttestation?.ip ?? null,
      order.subscriptionId ?? null,
      order.affiliateId ?? null,
      order.selfPurchase ?? false,
      idempotencyKey ?? null,
    ],
  };
}

export type OrderSearch = {
  search?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  paymentMethod?: string;
  status?: string;
  needsReview?: boolean;
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  limit?: number;
};

// Executive Office search: order number, customer name, email or SKU (a line's SKU, or the SKU of the strength a
// pre-Stage-1 line names), plus payment / fulfillment / method / review / date filters. Newest first.
export async function searchOrders(f: OrderSearch): Promise<Order[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.search) {
    const s = p(`%${f.search.toLowerCase()}%`);
    where.push(`(lower(o.reference) LIKE ${s}
      OR lower(o.customer::jsonb->>'email') LIKE ${s}
      OR lower((o.customer::jsonb->>'firstName') || ' ' || (o.customer::jsonb->>'lastName')) LIKE ${s}
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(o.items::jsonb) e
                  LEFT JOIN product_strengths ps ON ps.id = e->>'strengthId'
                  LEFT JOIN product_strengths pl ON e->>'strengthId' IS NULL AND pl.product_slug = e->>'slug' AND pl.label = e->>'sizeLabel'
                 WHERE lower(COALESCE(e->>'sku', ps.sku, pl.sku, '')) LIKE ${s}))`);
  }
  if (f.paymentStatus) where.push(`o.payment_status = ${p(f.paymentStatus)}`);
  if (f.fulfillmentStatus) where.push(`o.fulfillment_status = ${p(f.fulfillmentStatus)}`);
  if (f.paymentMethod) where.push(`o.payment_method = ${p(f.paymentMethod)}`);
  if (f.status) where.push(`o.status = ${p(f.status)}`);
  if (f.needsReview) where.push("o.needs_review");
  if (f.from) where.push(`o.created_at >= ${p(`${f.from}T00:00:00.000Z`)}`);
  if (f.to) where.push(`o.created_at <= ${p(`${f.to}T23:59:59.999Z`)}`);
  const limit = Math.min(Math.max(f.limit ?? 500, 1), 2000);
  const rows = await query<OrderRow>(
    `SELECT o.* FROM orders o ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY o.created_at DESC LIMIT ${limit}`,
    params
  );
  return rows.map(rowToOrder);
}

export async function listOrders(): Promise<Order[]> {
  const rows = await query<OrderRow>(`${SELECT_ALL} ORDER BY created_at DESC`);
  return rows.map(rowToOrder);
}

export async function getOrdersByCustomer(customerId: string): Promise<Order[]> {
  const rows = await query<OrderRow>(
    `${SELECT_ALL} WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId]
  );
  return rows.map(rowToOrder);
}

export async function getOrderByReference(reference: string): Promise<Order | null> {
  const rows = await query<OrderRow>(`${SELECT_ALL} WHERE reference = $1`, [
    reference.toUpperCase(),
  ]);
  return rows[0] ? rowToOrder(rows[0]) : null;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const rows = await query<OrderRow>(`${SELECT_ALL} WHERE id = $1`, [id]);
  return rows[0] ? rowToOrder(rows[0]) : null;
}

// Maps Order (camelCase) fields to their Postgres column names.
const PATCHABLE_COLUMNS: Record<string, string> = {
  status: "status",
  customerId: "customer_id",
  customer: "customer",
  items: "items",
  subtotal: "subtotal",
  total: "total",
  crypto: "crypto",
  paidAt: "paid_at",
  processingAt: "processing_at",
  shippedAt: "shipped_at",
  deliveredAt: "delivered_at",
  cancelledAt: "cancelled_at",
  cancelReason: "cancel_reason",
  carrier: "carrier",
  trackingNumber: "tracking_number",
  stockDecremented: "stock_decremented",
  promoCode: "promo_code",
  promoCodeId: "promo_code_id",
  discountAmount: "discount_amount",
  freeShipping: "free_shipping",
  refundedAt: "refunded_at",
  refundReason: "refund_reason",
  refundAmount: "refund_amount",
};

const JSON_FIELDS = new Set(["customer", "items", "crypto"]);

async function applyOrderPatch(
  lookupValue: string,
  patch: Partial<Order>,
  where: "id" | "cryptoChargeId"
): Promise<Order | null> {
  const fields = Object.keys(PATCHABLE_COLUMNS).filter((f) => f in patch);
  // crypto is stored as text (JSON string), so matching a field inside it
  // needs an explicit cast to jsonb.
  const whereClause = where === "id" ? "id = $1" : `crypto::jsonb->>'chargeId' = $1`;

  if (fields.length > 0) {
    const values: unknown[] = [lookupValue];
    const assignments = fields.map((field, i) => {
      const value = (patch as Record<string, unknown>)[field];
      values.push(
        value === undefined ? null : JSON_FIELDS.has(field) ? JSON.stringify(value) : value
      );
      return `${PATCHABLE_COLUMNS[field]} = $${i + 2}`;
    });
    await query(`UPDATE orders SET ${assignments.join(", ")} WHERE ${whereClause}`, values);
  }

  const rows = await query<OrderRow>(`${SELECT_ALL} WHERE ${whereClause}`, [lookupValue]);
  return rows[0] ? rowToOrder(rows[0]) : null;
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
  return applyOrderPatch(id, patch, "id");
}

export async function updateOrderByChargeId(
  chargeId: string,
  patch: Partial<Order>
): Promise<Order | null> {
  return applyOrderPatch(chargeId, patch, "cryptoChargeId");
}
