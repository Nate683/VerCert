import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listProducts, createProduct, getProductBySlug, pricedSizes } from "@/lib/products";
import { upsertInventory, listInventory } from "@/lib/inventory";
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

  const [products, inventory] = await Promise.all([
    listProducts({ includeInactive: true }),
    listInventory(),
  ]);
  const stockBySlug = new Map(inventory.map((i) => [i.slug, i]));

  return NextResponse.json({
    products: products.map((p) => ({ ...p, stock: stockBySlug.get(p.slug) ?? null })),
  });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, productSchema);
  if ("error" in parsed) return parsed.error;
  const { initialStock, ...input } = parsed.data;

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

  const product = await createProduct(input);
  await upsertInventory(product.slug, initialStock ?? 0);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "product.created", product.name);

  return NextResponse.json({ product });
});
