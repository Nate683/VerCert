import { lotKey, publishedLotKeys } from "@/lib/coa/public";
import type { Product } from "@/lib/types";

// Server-only. A purity figure reaches a customer only with a certificate behind it: an approved, published
// certificate record (COA verification system, lib/coa) for the lot they would receive — the product's first
// listed lot, which orders are filled from. Without one the figure is removed here, before the product leaves the
// server, so it isn't in the page source either. The stored value is left alone and the executive portal still
// shows it. Owner's rule, November 5 2026; the certificate source moved to the verification records in November.
export async function withCertifiedPurity<T extends Pick<Product, "slug" | "purityPercent" | "batchNumbers">>(
  products: T[]
): Promise<T[]> {
  if (!products.some((p) => p.purityPercent !== null)) return products;
  const certified = await publishedLotKeys();
  return products.map((p) => {
    const lot = p.batchNumbers[0];
    return p.purityPercent !== null && !(lot && certified.has(lotKey(p.slug, lot))) ? { ...p, purityPercent: null } : p;
  });
}
