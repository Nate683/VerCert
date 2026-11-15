import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug } from "@/lib/products";
import { deleteBlobs } from "@/lib/products/blob-images";
import { ImageIngestError, ingestProductImage } from "@/lib/products/image-ingest";
import { setStrengthImage } from "@/lib/products/strength-store";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";
// Decoding and re-encoding a large render takes a few seconds.
export const maxDuration = 60;

type Params = { params: Promise<{ slug: string; id: string }> };

// One strength's primary vial image (Stage 1). The same pipeline as the product photo (../../image/route.ts): the
// browser uploads the original to this product's incoming folder in Blob, this route processes it, stores the
// processed copy, points the strength's image_url at it, then deletes the original and the image it replaced. The
// product photo and the gallery are never touched. A strength without an image shows the product photo.
export const PUT = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { slug, id } = await params;
  const product = await getProductBySlug(slug);
  const strength = product?.sizes.find((s) => s.id === id);
  if (!product || !strength) return NextResponse.json({ error: "Strength not found." }, { status: 404 });

  const { uploadUrl } = (await request.json().catch(() => ({}))) as { uploadUrl?: string };

  let image;
  try {
    image = await ingestProductImage(slug, uploadUrl);
  } catch (err) {
    if (err instanceof ImageIngestError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let result;
  try {
    result = await setStrengthImage(slug, id, image.url);
  } catch (err) {
    await deleteBlobs([image.url]);
    throw err;
  }
  if (!result) {
    await deleteBlobs([image.url]);
    return NextResponse.json({ error: "Strength not found." }, { status: 404 });
  }
  await deleteBlobs([result.previous]);

  const actor = await getCurrentCustomer();
  if (actor) {
    await logActivity(actor.email, "product.strength_image_updated", `${slug} ${strength.label} (${strength.sku}): ${image.width}×${image.height}, ${Math.round(image.bytes / 1024)} KB`);
  }
  return NextResponse.json({ product: await getProductBySlug(slug), image });
});

export const DELETE = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { slug, id } = await params;
  const product = await getProductBySlug(slug);
  const strength = product?.sizes.find((s) => s.id === id);
  if (!product || !strength) return NextResponse.json({ error: "Strength not found." }, { status: 404 });

  const result = await setStrengthImage(slug, id, null);
  if (result) await deleteBlobs([result.previous]);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "product.strength_image_removed", `${slug} ${strength.label} (${strength.sku})`);
  return NextResponse.json({ product: await getProductBySlug(slug) });
});
