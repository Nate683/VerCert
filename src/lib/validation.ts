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
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["processing", "shipped", "delivered"]),
  carrier: z.string().trim().max(100).optional(),
  trackingNumber: z.string().trim().max(100).optional(),
});

export const orderCancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
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
