import { z } from "zod";
import { NextResponse } from "next/server";

// Shared zod schemas for the highest-risk request bodies (auth + money
// paths). Parse with `parseBody` to get a consistent 400 response shape.

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  marketingOptIn: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

const customerInfoSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(100),
});

const orderItemSchema = z.object({
  slug: z.string().min(1).max(100),
  sizeLabel: z.string().min(1).max(50),
  quantity: z.number().int().min(1).max(999),
});

export const createOrderSchema = z.object({
  customer: customerInfoSchema,
  items: z.array(orderItemSchema).min(1).max(50),
  paymentMethod: z.enum(["crypto", "bank_transfer"]),
  promoCode: z.string().trim().max(40).optional(),
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["processing", "shipped", "delivered"]),
  carrier: z.string().trim().max(100).optional(),
  trackingNumber: z.string().trim().max(100).optional(),
});

export const orderCancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const bulkTierSchema = z.object({
  minQuantity: z.number().int().min(2).max(100000),
  priceUsd: z.number().min(0).max(1000000),
});

const sizeOptionSchema = z.object({
  label: z.string().trim().min(1).max(50),
  priceUsd: z.number().min(0).max(1000000),
  bulkTiers: z.array(bulkTierSchema).max(10).optional(),
});

export const productSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers, and hyphens"),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  casNumber: z.string().trim().min(1).max(50),
  molecularFormula: z.string().trim().min(1).max(100),
  molecularWeight: z.string().trim().min(1).max(50),
  purityPercent: z.number().min(0).max(100),
  sequenceOrForm: z.string().trim().min(1).max(2000),
  storage: z.string().trim().min(1).max(500),
  sizes: z.array(sizeOptionSchema).min(1).max(20),
  batchNumbers: z.array(z.string().trim().min(1).max(50)).max(50),
  summary: z.string().trim().min(1).max(500),
  description: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
  initialStock: z.number().int().min(0).max(1000000).optional(),
  active: z.boolean().optional(),
  costUsd: z.number().min(0).max(1000000).optional(),
});

export const productUpdateSchema = productSchema.partial().omit({ slug: true });

export const promoCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "code must be letters, numbers, hyphens, or underscores"),
  type: z.enum(["percent", "fixed", "free_shipping"]),
  value: z.number().min(0).max(1000000),
  minOrderAmount: z.number().min(0).max(1000000).optional(),
  usageLimit: z.number().int().min(1).max(1000000).optional(),
  perCustomerLimit: z.number().int().min(1).max(1000000).optional(),
  startsAt: z.string().trim().min(1).max(40).optional(),
  endsAt: z.string().trim().min(1).max(40).optional(),
  active: z.boolean().optional(),
  restrictedProductSlugs: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
  restrictedCategories: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

export const promoCodeUpdateSchema = promoCodeSchema.partial();

export const promoValidateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  items: z.array(orderItemSchema).min(1).max(50),
});

export const siteContentUpdateSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.unknown(),
});

export const affiliateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(50).optional(),
  paymentMethod: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  commissionType: z.enum(["percent", "flat"]),
  commissionRate: z.number().min(0).max(100).optional(),
  commissionFlatAmount: z.number().min(0).max(1000000).optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "code must be letters, numbers, hyphens, or underscores"),
  customerDiscountPercent: z.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

export const affiliateUpdateSchema = affiliateSchema
  .omit({ code: true, customerDiscountPercent: true })
  .partial();

export const affiliatePayoutSchema = z.object({
  amount: z.number().min(0.01).max(1000000),
  paidAt: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

export const refundOrderSchema = z.object({
  reason: z.enum(["customer_request", "quality_issue", "duplicate_order", "shipping_issue", "other"]),
  amount: z.number().min(0).max(1000000).optional(),
  note: z.string().trim().max(500).optional(),
});

export const customerNotesSchema = z.object({
  notes: z.string().trim().max(5000),
});

export const trackEventSchema = z.object({
  event: z.enum(["page_view", "add_to_cart", "checkout_started", "order_completed"]),
  sessionId: z.string().trim().min(1).max(100),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }) };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request.";
    const field = result.error.issues[0]?.path.join(".");
    return {
      error: NextResponse.json(
        { error: field ? `${field}: ${message}` : message },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}
