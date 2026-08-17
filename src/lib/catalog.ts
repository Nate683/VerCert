import type { Product } from "./types";

// A slim projection of the catalog, small enough to ship to the browser once
// and search instantly on every keystroke without a round trip per character.
export type CatalogEntry = {
  slug: string;
  name: string;
  category: string;
  casNumber: string;
  purityPercent: number;
  minPriceUsd: number;
  maxPriceUsd: number;
  batchNumber?: string;
  imageUrl?: string;
};

export function toCatalogEntry(product: Product): CatalogEntry {
  const prices = product.sizes.map((s) => s.priceUsd);
  return {
    slug: product.slug,
    name: product.name,
    category: product.category,
    casNumber: product.casNumber,
    purityPercent: product.purityPercent,
    minPriceUsd: prices.length > 0 ? Math.min(...prices) : 0,
    maxPriceUsd: prices.length > 0 ? Math.max(...prices) : 0,
    batchNumber: product.batchNumbers[0],
    imageUrl: product.primaryImageUrl,
  };
}

/**
 * Ranks catalog entries against a query. Matches on product name and CAS
 * number (with punctuation ignored, so "1234567" finds "123-45-67") and on
 * category. Earlier matches rank above later ones so typing a prefix puts the
 * obvious answer first.
 */
export function searchCatalog(entries: CatalogEntry[], rawQuery: string, limit = 8): CatalogEntry[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return [];
  const digits = query.replace(/[^a-z0-9]/g, "");

  const scored: { entry: CatalogEntry; score: number }[] = [];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    const cas = entry.casNumber.toLowerCase();
    const casDigits = cas.replace(/[^a-z0-9]/g, "");
    const category = entry.category.toLowerCase();

    let score = -1;
    if (name.startsWith(query)) score = 0;
    else if (cas.startsWith(query) || (digits.length >= 3 && casDigits.startsWith(digits))) score = 1;
    else if (name.includes(query)) score = 2 + name.indexOf(query);
    else if (digits.length >= 3 && casDigits.includes(digits)) score = 40;
    else if (category.includes(query)) score = 60;

    if (score >= 0) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((s) => s.entry);
}
