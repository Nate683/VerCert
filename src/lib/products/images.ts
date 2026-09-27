import type { Product } from "@/lib/types";

// Product photos are transparent PNGs in public/products, named by slug:
// /products/<slug>.png. Nothing is stored per product — drop the file in and
// it appears; until then the placeholder shows.
export const productImagePath = (slug: string) => `/products/${slug}.png`;

// Intrinsic size given to every product <img> (the photos are square), so the
// browser reserves the space before the file arrives.
export const PRODUCT_IMAGE_PX = 800;

// The slug photo first, then any image uploaded from the Products tab.
export function productImageSources(product: Pick<Product, "slug" | "primaryImageUrl">): string[] {
  return [productImagePath(product.slug), product.primaryImageUrl].filter((src): src is string => Boolean(src));
}

// "Retatrutide, 5 mg / 10 mg". Signed-out tiles arrive without sizes (see
// withoutPricing), so those fall back to the name alone.
export function productImageAlt(product: Pick<Product, "name" | "sizes">): string {
  const sizes = product.sizes.map((s) => s.label.trim()).filter(Boolean);
  return sizes.length ? `${product.name}, ${sizes.join(" / ")}` : product.name;
}
