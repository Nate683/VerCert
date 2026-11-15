import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listProducts, createProduct, getProductBySlug, pricedSizes } from "@/lib/products";
import { StrengthError, strengthConflict } from "@/lib/products/strength-store";
import { listStrengthStock } from "@/lib/inventory";
import { productSchema, parseBody } from "@/lib/validation";
import { findBlockedTerm, blockedTermMessage, PRODUCT_NON_COPY_KEYS } from "@/lib/content-guard";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [products, stock] = await Promise.all([listProducts({ includeInactive: true }), listStrengthStock()]);
  // Stage 2: each strength's stock, by its permanent id (read-only here; changed in the Stock tab).
  const byId = new Map(stock.map((r) => [r.strengthId, r]));
  return NextResponse.json({
    products: products.map((p) => ({
      ...p,
      strengthStock: Object.fromEntries(
        p.sizes.filter((s) => s.id && byId.has(s.id)).map((s) => {
          const r = byId.get(s.id!)!;
          return [s.id!, { physical: r.physical, reserved: r.reserved, available: r.available, threshold: r.threshold, level: r.level }];
        })
      ),
    })),
  });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, productSchema);
  if ("error" in parsed) return parsed.error;
  const { initialStock, sizeStock, ...input } = parsed.data;
  // Stage 2: a new product's strengths open at 0; stock is then added through recorded adjustments (Stock tab).
  if (initialStock !== undefined || sizeStock !== undefined) {
    return NextResponse.json(
      { error: "Stock is no longer set from the product editor. Save the product, then add stock in Executive Office → Stock." },
      { status: 400 }
    );
  }

  const blocked = findBlockedTerm(input, PRODUCT_NON_COPY_KEYS);
  if (blocked) return NextResponse.json({ error: blockedTermMessage(blocked) }, { status: 400 });

  if (input.active !== false && pricedSizes(input).length === 0) {
    return NextResponse.json({ error: "Set a price on at least one size before making this product active." }, { status: 400 });
  }

  if (await getProductBySlug(input.slug)) {
    return NextResponse.json(
      { error: "A product with this slug already exists." },
      { status: 409 }
    );
  }

  let product;
  try {
    product = await createProduct(input);
  } catch (err) {
    if (err instanceof StrengthError) return NextResponse.json({ error: err.message }, { status: 400 });
    const conflict = strengthConflict(err);
    if (conflict) return NextResponse.json({ error: conflict.message }, { status: 409 });
    throw err;
  }

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "product.created", product.name);

  return NextResponse.json({ product });
});
