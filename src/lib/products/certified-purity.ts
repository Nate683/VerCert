import { listCoaDocuments } from "@/lib/coa-documents";
import type { Product } from "@/lib/types";

// Server-only. A purity figure reaches a customer only with a certificate
// behind it: an uploaded COA file (coa_documents) for the lot they would
// receive — the product's first listed lot, which orders are filled from.
// Without one the figure is removed here, before the product leaves the
// server, so it isn't in the page source either. The stored value is left
// alone and /command still shows it. Owner's rule, November 5 2026.
export async function withCertifiedPurity<T extends Pick<Product, "purityPercent" | "batchNumbers">>(
  products: T[]
): Promise<T[]> {
  if (!products.some((p) => p.purityPercent !== null)) return products;
  const certified = new Set((await listCoaDocuments()).map((doc) => doc.batchNumber));
  return products.map((p) => {
    const lot = p.batchNumbers[0];
    return p.purityPercent !== null && !(lot && certified.has(lot)) ? { ...p, purityPercent: null } : p;
  });
}
