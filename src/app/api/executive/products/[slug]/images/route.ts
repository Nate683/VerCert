import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug, updateProduct } from "@/lib/products";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// Uploads a product photo to Vercel Blob and sets it as the primary image or
// appends it to the gallery, depending on `kind` in the form data.
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const kind = formData.get("kind") === "gallery" ? "gallery" : "primary";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or AVIF images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image must be 8MB or smaller." }, { status: 400 });
  }

  const blob = await put(`products/${slug}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  const product2 = await updateProduct(
    slug,
    kind === "primary"
      ? { primaryImageUrl: blob.url }
      : { galleryImageUrls: [...(product.galleryImageUrls ?? []), blob.url] }
  );

  return NextResponse.json({ product: product2, url: blob.url });
});

// Removes an image URL from the product (primary or gallery).
export const DELETE = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ error: "A url is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (product.primaryImageUrl === url) patch.primaryImageUrl = undefined;
  if (product.galleryImageUrls?.includes(url)) {
    patch.galleryImageUrls = product.galleryImageUrls.filter((u) => u !== url);
  }

  await del(url).catch(() => undefined);
  const updated = await updateProduct(slug, patch);

  return NextResponse.json({ product: updated });
});
