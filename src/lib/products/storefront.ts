import type { Product } from "@/lib/types";
import { pricedSizes } from "./pricing";

// A product as it may be sent to the browser. costUsd is our cost of goods —
// margin data that must never end up in a page's serialized props. Sizes still
// awaiting a price are left off: they aren't for sale.
export function toStorefrontProduct(product: Product): Product {
  const storefront = { ...product, sizes: pricedSizes(product) };
  delete storefront.costUsd;
  return storefront;
}

// For signed-out visitors: enough to draw the tile, none of the pricing.
export function withoutPricing(product: Product): Product {
  return { ...toStorefrontProduct(product), sizes: [] };
}
