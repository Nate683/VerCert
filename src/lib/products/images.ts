import type { Product } from "@/lib/types";

// A product's photo is the image uploaded from the Products tab (image_url),
// else the older primary upload, else the placeholder. No URL is guessed: a
// product without an image makes no image request at all.

// Intrinsic size given to every product <img> (the photos are square), so the
// browser reserves the space before the file arrives.
export const PRODUCT_IMAGE_PX = 800;

export function productImageSources(product: Pick<Product, "imageUrl" | "primaryImageUrl">): string[] {
  return [product.imageUrl, product.primaryImageUrl].filter(
    (src): src is string => Boolean(src)
  );
}

// "Retatrutide, 5 mg / 10 mg". Signed-out tiles arrive without sizes (see
// withoutPricing), so those fall back to the name alone.
export function productImageAlt(product: Pick<Product, "name" | "sizes">): string {
  const sizes = product.sizes.map((s) => s.label.trim()).filter(Boolean);
  return sizes.length ? `${product.name}, ${sizes.join(" / ")}` : product.name;
}
