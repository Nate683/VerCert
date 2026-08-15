import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug, updateProduct, deleteProduct } from "@/lib/products";
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
  if (!(await getProductBySlug(slug))) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, productUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const { initialStock, ...patch } = parsed.data;

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
