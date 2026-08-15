import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { CartItem, CustomerInfo, Order, OrderStatus, PaymentMethod } from "@/lib/types";
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
};

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
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const order: Order = {
    id: randomUUID(),
    reference: generateOrderReference(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  await query(
    `INSERT INTO orders
      (id, reference, created_at, status, payment_method, customer_id, customer, items, subtotal, total, promo_code, promo_code_id, discount_amount, free_shipping)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
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
    ]
  );

  return order;
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
