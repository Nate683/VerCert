import type { Product } from "@/lib/types";

// A product's photo comes from, in order: the image uploaded from the
// Products tab (image_url), the older primary upload, a file committed at
// public/products/<slug>.png, and finally the placeholder.
export const productImagePath = (slug: string) => `/products/${slug}.png`;

// Intrinsic size given to every product <img> (the photos are square), so the
// browser reserves the space before the file arrives.
export const PRODUCT_IMAGE_PX = 800;

export function productImageSources(product: Pick<Product, "slug" | "imageUrl" | "primaryImageUrl">): string[] {
  return [product.imageUrl, product.primaryImageUrl, productImagePath(product.slug)].filter(
    (src): src is string => Boolean(src)
  );
}

// "Retatrutide, 5 mg / 10 mg". Signed-out tiles arrive without sizes (see
// withoutPricing), so those fall back to the name alone.
export function productImageAlt(product: Pick<Product, "name" | "sizes">): string {
  const sizes = product.sizes.map((s) => s.label.trim()).filter(Boolean);
  return sizes.length ? `${product.name}, ${sizes.join(" / ")}` : product.name;
}
