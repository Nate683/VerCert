import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug, setProductImage } from "@/lib/products";
import { InvalidProductImageError, processProductImage } from "@/lib/products/image-processing";
import { deleteBlobs, isIncomingUpload, sweepAbandonedUploads } from "@/lib/products/blob-images";
import { PRODUCT_IMAGE_MAX_BYTES } from "@/lib/products/image-rules";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";
// Decoding and re-encoding a large render takes a few seconds.
export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

// Saves an uploaded original as the product photo: processes it, stores the
// processed copy, points image_url at it, then deletes the original and the
// photo it replaced so no unreferenced blobs are left paying rent.
export const PUT = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const { uploadUrl } = (await request.json().catch(() => ({}))) as { uploadUrl?: string };
  // Only ever fetch from this product's incoming folder in our own store.
  if (!isIncomingUpload(uploadUrl, slug)) {
    return NextResponse.json({ error: "That upload isn't one this product can use." }, { status: 400 });
  }

  try {
    const res = await fetch(uploadUrl, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "The uploaded file couldn't be read back." }, { status: 400 });
    const original = Buffer.from(await res.arrayBuffer());
    if (original.length > PRODUCT_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 400 });
    }

    const processed = await processProductImage(original);
    const stored = await put(`products/${slug}/${slug}.${processed.extension}`, processed.data, {
      access: "public",
      contentType: processed.contentType,
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });

    let updated;
    try {
      updated = await setProductImage(slug, stored.url);
    } catch (err) {
      await deleteBlobs([stored.url]);
      throw err;
    }
    await deleteBlobs([product.imageUrl, product.primaryImageUrl]);

    const actor = await getCurrentCustomer();
    if (actor) {
      await logActivity(actor.email, "product.image_updated", `${slug}: ${processed.width}×${processed.height}, ${Math.round(processed.data.length / 1024)} KB`);
    }

    return NextResponse.json({
      product: updated,
      image: { url: stored.url, width: processed.width, height: processed.height, bytes: processed.data.length },
    });
  } catch (err) {
    if (err instanceof InvalidProductImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  } finally {
    await deleteBlobs([uploadUrl]);
    await sweepAbandonedUploads();
  }
});

export const DELETE = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const updated = await setProductImage(slug, null);
  await deleteBlobs([product.imageUrl, product.primaryImageUrl]);

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "product.image_removed", slug);

  return NextResponse.json({ product: updated });
});
