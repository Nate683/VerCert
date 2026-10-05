import type { Product } from "./types";
import { pricedSizes } from "./products/pricing";
import { searchScore } from "./search";

// A slim projection of the catalog, small enough to ship to the browser once
// and search instantly on every keystroke without a round trip per character.
export type CatalogEntry = {
  slug: string;
  name: string;
  category: string | null;
  alternateNames?: string[];
  casNumber: string | null;
  purityPercent: number | null;
  minPriceUsd: number;
  maxPriceUsd: number;
  batchNumber?: string;
  imageUrl?: string;
};

export function toCatalogEntry(product: Product): CatalogEntry {
  const prices = pricedSizes(product).map((s) => s.priceUsd);
  return {
    slug: product.slug,
    name: product.name,
    category: product.category,
    alternateNames: product.alternateNames,
    casNumber: product.casNumber,
    purityPercent: product.purityPercent,
    minPriceUsd: prices.length > 0 ? Math.min(...prices) : 0,
    maxPriceUsd: prices.length > 0 ? Math.max(...prices) : 0,
    batchNumber: product.batchNumbers[0],
    imageUrl: product.imageUrl ?? product.primaryImageUrl,
  };
}

// Ranks catalog entries against a query; see lib/search.ts for the rules.
export function searchCatalog(entries: CatalogEntry[], rawQuery: string, limit = 8): CatalogEntry[] {
  const scored: { entry: CatalogEntry; score: number }[] = [];
  for (const entry of entries) {
    const score = searchScore(entry, rawQuery);
    if (score !== null) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((s) => s.entry);
}
