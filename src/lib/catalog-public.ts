import type { Product, PricedSize } from "./types";
import { pricedSizes } from "./products/pricing";

// Client-safe. The PUBLIC compound list behind the signed-out header search and its "View All" list (Website
// Refinements Package 1). Same eligibility as the storefront: only products that are on sale (visible, with at least
// one active, priced strength — isOnSale / pricedSizes); hidden products and deactivated or unpriced strengths never
// appear. One entry per compound; its strengths are listed inside it, so several strengths count once.
//
// It carries only what the search shows: name, alternate names and CAS (for matching), the existing product photo,
// and each strength's label and price. No stock, lot, purity, cost, SKU, certificate or link data.

// Products left out of the PUBLIC compound list and its count only (owner decision, Package 1 final corrections):
// BAC Water is a laboratory supply, not a compound. It stays on sale, in the signed-in catalog search (/api/catalog)
// and on its own product page; nothing about the product itself changes. Listed by permanent product id.
export const PUBLIC_COMPOUND_EXCLUSIONS: ReadonlySet<string> = new Set(["bac-water"]);
export const isPublicCompound = (product: Pick<Product, "slug">) => !PUBLIC_COMPOUND_EXCLUSIONS.has(product.slug);

export type PublicPrice = {
  // The strength's list price — the same product_strengths.price_usd the storefront shows.
  regularUsd: number;
  // What a signed-out visitor would pay. Equal to regularUsd today: the catalog has no centralized, publicly
  // available promotional price (bulk tiers, subscription discounts and promo codes are applied at checkout or to
  // registered customers, and are never advertised here). A future promotions system plugs in at publicPrice().
  effectiveUsd: number;
};

export type PublicStrength = { label: string; price: PublicPrice };

export type PublicCompound = {
  slug: string;
  name: string;
  alternateNames?: string[];
  casNumber: string | null;
  imageUrl?: string;
  strengths: PublicStrength[];
};

// The single place a public price is decided.
export function publicPrice(size: PricedSize): PublicPrice {
  return { regularUsd: size.priceUsd, effectiveUsd: size.priceUsd };
}

export function toPublicCompound(product: Product): PublicCompound {
  return {
    slug: product.slug,
    name: product.name,
    alternateNames: product.alternateNames?.length ? product.alternateNames : undefined,
    casNumber: product.casNumber ?? null,
    imageUrl: product.imageUrl ?? product.primaryImageUrl ?? undefined,
    strengths: pricedSizes(product).map((s) => ({ label: s.label, price: publicPrice(s) })),
  };
}

export const usd = (n: number) => `$${n.toFixed(2)}`;
