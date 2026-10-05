import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug, setProductImage } from "@/lib/products";
import { deleteBlobs } from "@/lib/products/blob-images";
import { ImageIngestError, ingestProductImage } from "@/lib/products/image-ingest";
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

  let image;
  try {
    image = await ingestProductImage(slug, uploadUrl);
  } catch (err) {
    if (err instanceof ImageIngestError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let updated;
  try {
    updated = await setProductImage(slug, image.url);
  } catch (err) {
    await deleteBlobs([image.url]);
    throw err;
  }
  await deleteBlobs([product.imageUrl, product.primaryImageUrl]);

  const actor = await getCurrentCustomer();
  if (actor) {
    await logActivity(actor.email, "product.image_updated", `${slug}: ${image.width}×${image.height}, ${Math.round(image.bytes / 1024)} KB`);
  }

  return NextResponse.json({ product: updated, image });
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
