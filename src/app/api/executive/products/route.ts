import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listProducts, createProduct, getProductBySlug } from "@/lib/products";
import { upsertInventory, listInventory } from "@/lib/inventory";
import { productSchema, parseBody } from "@/lib/validation";
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
