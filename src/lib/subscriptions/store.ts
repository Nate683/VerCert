import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { CustomerInfo, PaymentMethod } from "@/lib/types";

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export type Subscription = {
  id: string;
  customerId: string;
  productSlug: string;
  sizeLabel: string;
  quantity: number;
  intervalDays: number;
  discountPercent: number;
  paymentMethod: PaymentMethod;
  customer: CustomerInfo;
  status: SubscriptionStatus;
  // Why it was paused (e.g. the product went out of stock), shown to the
  // customer and staff.
  statusReason?: string;
  nextOrderAt: string;
  lastOrderReference?: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  customer_id: string;
  product_slug: string;
  size_label: string;
  quantity: number;
  interval_days: number;
  discount_percent: number;
  payment_method: PaymentMethod;
  customer: string;
  status: SubscriptionStatus;
  status_reason: string | null;
  next_order_at: string;
  last_order_reference: string | null;
  created_at: string;
  updated_at: string;
};

function toSubscription(r: Row): Subscription {
  return {
    id: r.id,
    customerId: r.customer_id,
    productSlug: r.product_slug,
    sizeLabel: r.size_label,
    quantity: Number(r.quantity),
    intervalDays: Number(r.interval_days),
    discountPercent: Number(r.discount_percent),
    paymentMethod: r.payment_method,
    customer: JSON.parse(r.customer) as CustomerInfo,
    status: r.status,
    statusReason: r.status_reason ?? undefined,
    nextOrderAt: r.next_order_at,
    lastOrderReference: r.last_order_reference ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

export async function createSubscription(input: {
  customerId: string;
  productSlug: string;
  sizeLabel: string;
  quantity: number;
  intervalDays: number;
  discountPercent: number;
  paymentMethod: PaymentMethod;
  customer: CustomerInfo;
  firstOrderReference: string;
}): Promise<Subscription> {
  const now = new Date().toISOString();
  const id = randomUUID();
  await query(
    `INSERT INTO subscriptions
      (id, customer_id, product_slug, size_label, quantity, interval_days, discount_percent, payment_method, customer,
       status, next_order_at, last_order_reference, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11, $12, $12)`,
    [
      id,
      input.customerId,
      input.productSlug,
      input.sizeLabel,
      input.quantity,
      input.intervalDays,
      input.discountPercent,
      input.paymentMethod,
      JSON.stringify(input.customer),
      addDays(now, input.intervalDays),
      input.firstOrderReference,
      now,
    ]
  );
  return (await getSubscription(id))!;
}

export async function getSubscription(id: string): Promise<Subscription | null> {
  const rows = await query<Row>("SELECT * FROM subscriptions WHERE id = $1", [id]);
  return rows[0] ? toSubscription(rows[0]) : null;
}

export async function listSubscriptionsForCustomer(customerId: string): Promise<Subscription[]> {
  const rows = await query<Row>("SELECT * FROM subscriptions WHERE customer_id = $1 ORDER BY created_at DESC", [customerId]);
  return rows.map(toSubscription);
}

export async function listAllSubscriptions(): Promise<Subscription[]> {
  const rows = await query<Row>("SELECT * FROM subscriptions ORDER BY created_at DESC");
  return rows.map(toSubscription);
}

export async function listDueSubscriptions(nowIso: string): Promise<Subscription[]> {
  const rows = await query<Row>(
    "SELECT * FROM subscriptions WHERE status = 'active' AND next_order_at <= $1 ORDER BY next_order_at",
    [nowIso]
  );
  return rows.map(toSubscription);
}

export async function updateSubscription(
  id: string,
  patch: Partial<Pick<Subscription, "status" | "statusReason" | "nextOrderAt" | "lastOrderReference" | "intervalDays">>
): Promise<Subscription | null> {
  const columns: Record<string, string> = {
    status: "status",
    statusReason: "status_reason",
    nextOrderAt: "next_order_at",
    lastOrderReference: "last_order_reference",
    intervalDays: "interval_days",
  };
  const fields = Object.keys(patch).filter((k) => k in columns);
  if (fields.length > 0) {
    const values: unknown[] = [id];
    const sets = fields.map((f, i) => {
      values.push((patch as Record<string, unknown>)[f] ?? null);
      return `${columns[f]} = $${i + 2}`;
    });
    values.push(new Date().toISOString());
    await query(`UPDATE subscriptions SET ${sets.join(", ")}, updated_at = $${values.length} WHERE id = $1`, values);
  }
  return getSubscription(id);
}
