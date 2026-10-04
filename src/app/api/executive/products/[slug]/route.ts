import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug, updateProduct, deleteProduct, pricedSizes } from "@/lib/products";
import { upsertInventory, deleteInventory } from "@/lib/inventory";
import { productUpdateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { slug } = await params;
  const existing = await getProductBySlug(slug);
  if (!existing) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, productUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const { initialStock, sizePrice, ...patch } = parsed.data;

  if (sizePrice) {
    const sizes = patch.sizes ?? existing.sizes;
    if (!sizes.some((s) => s.label === sizePrice.label)) {
      return NextResponse.json({ error: `No size "${sizePrice.label}" on this product.` }, { status: 400 });
    }
    patch.sizes = sizes.map((s) => (s.label === sizePrice.label ? { ...s, priceUsd: sizePrice.priceUsd } : s));
  }

  // Nothing goes on sale without a price: an active product needs at least
  // one priced size, whichever of the two this request changes.
  const willBeActive = patch.active ?? existing.active !== false;
  if (willBeActive && pricedSizes({ sizes: patch.sizes ?? existing.sizes }).length === 0) {
    return NextResponse.json({ error: "Set a price on at least one size before making this product active." }, { status: 400 });
  }

  const product = await updateProduct(slug, patch);
  if (initialStock !== undefined) await upsertInventory(slug, initialStock);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "product.updated", slug);

  return NextResponse.json({ product });
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { slug } = await params;
  await deleteProduct(slug);
  await deleteInventory(slug);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "product.deleted", slug);

  return NextResponse.json({ ok: true });
});
