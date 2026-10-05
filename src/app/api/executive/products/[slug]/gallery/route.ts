import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug, updateProduct } from "@/lib/products";
import { deleteBlobs } from "@/lib/products/blob-images";
import { ImageIngestError, ingestProductImage } from "@/lib/products/image-ingest";
import { PRODUCT_GALLERY_MAX } from "@/lib/products/image-rules";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";
// Decoding and re-encoding a large render takes a few seconds.
export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

// The extra photos shown after the main one on the product page. Uploads use
// the same browser → Blob → process path as the main photo (the upload token
// comes from ../image/upload); this route adds, reorders and removes them.

async function log(action: string, details: string) {
  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, action, details);
}

async function load(params: Params["params"]) {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  return { slug, product, gallery: product.galleryImageUrls ?? [] };
}

// Adds a processed upload to the end of the gallery.
export const PUT = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const ctx = await load(params);
  if (ctx instanceof NextResponse) return ctx;
  const { slug, gallery } = ctx;
  if (gallery.length >= PRODUCT_GALLERY_MAX) {
    return NextResponse.json({ error: `A product can have up to ${PRODUCT_GALLERY_MAX} extra photos.` }, { status: 400 });
  }

  const { uploadUrl } = (await request.json().catch(() => ({}))) as { uploadUrl?: string };
  let image;
  try {
    image = await ingestProductImage(slug, uploadUrl);
  } catch (err) {
    if (err instanceof ImageIngestError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let updated;
  try {
    updated = await updateProduct(slug, { galleryImageUrls: [...gallery, image.url] });
  } catch (err) {
    await deleteBlobs([image.url]);
    throw err;
  }
  await log("product.gallery_image_added", `${slug}: ${image.width}×${image.height}, ${Math.round(image.bytes / 1024)} KB`);
  return NextResponse.json({ product: updated, image });
});

// Reorders: `order` must hold exactly the current gallery URLs.
export const PATCH = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const ctx = await load(params);
  if (ctx instanceof NextResponse) return ctx;
  const { slug, gallery } = ctx;

  const { order } = (await request.json().catch(() => ({}))) as { order?: unknown };
  const sameSet =
    Array.isArray(order) &&
    order.length === gallery.length &&
    order.every((u) => typeof u === "string" && gallery.includes(u)) &&
    new Set(order).size === order.length;
  if (!sameSet) {
    return NextResponse.json({ error: "The gallery changed — reload and try again." }, { status: 409 });
  }

  const updated = await updateProduct(slug, { galleryImageUrls: order as string[] });
  return NextResponse.json({ product: updated });
});

// Removes one gallery photo and deletes its blob.
export const DELETE = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const ctx = await load(params);
  if (ctx instanceof NextResponse) return ctx;
  const { slug, gallery } = ctx;

  const url = new URL(request.url).searchParams.get("url");
  if (!url || !gallery.includes(url)) {
    return NextResponse.json({ error: "That photo isn't in this product's gallery." }, { status: 404 });
  }

  const updated = await updateProduct(slug, { galleryImageUrls: gallery.filter((u) => u !== url) });
  await deleteBlobs([url]);
  await log("product.gallery_image_removed", slug);
  return NextResponse.json({ product: updated });
});
