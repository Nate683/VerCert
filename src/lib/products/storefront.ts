import type { Product } from "@/lib/types";
import { pricedSizes } from "./pricing";

// A product as it may be sent to the browser. costUsd (on the product and on
// each size) is our cost of goods — margin data that must never end up in a
// page's serialized props. Sizes still awaiting a price are left off: they
// aren't for sale.
export function toStorefrontProduct(product: Product): Product {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sizes = pricedSizes(product).map(({ costUsd, ...size }) => size);
  const storefront = { ...product, sizes };
  delete storefront.costUsd;
  return storefront;
}

// For signed-out visitors on the homepage: the tile plus one unit price, the
// lowest-priced size's label and list price. No quantity breaks, no cost.
export function withPublicPrice(product: Product): Product {
  const storefront = toStorefrontProduct(product);
  const cheapest = [...storefront.sizes].sort((a, b) => a.priceUsd! - b.priceUsd!)[0];
  return {
    ...storefront,
    sizes: cheapest ? [{ label: cheapest.label, priceUsd: cheapest.priceUsd }] : [],
    sizeStock: undefined,
  };
}

