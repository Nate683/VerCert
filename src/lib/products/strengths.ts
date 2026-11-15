import type { Product, SizeOption } from "@/lib/types";
import { defaultStrength } from "./availability";

// Client-safe helpers for strength-specific SKUs (Stage 1). Storage is in
// strength-store.ts (server-only).

// The SKU code convention — the same one the certificate system already uses
// (lib/coa/admin.ts, lib/coa/public.ts), so a certificate's stored SKU and the
// strength's agree: upper("<slug>-<label>") with whitespace removed.
export function skuOf(slug: string, label: string): string {
  return `${slug}-${label}`.toUpperCase().replace(/\s+/g, "");
}

// A strength's key on a product page: its permanent id, or its label for a
// strength saved before ids existed.
export function strengthKey(size: Pick<SizeOption, "id" | "label">): string {
  return size.id ?? size.label;
}

// The value a shareable URL carries: /shop/bpc-157?strength=10mg. The label,
// lower-cased, spaces removed ("5 mg / 5 mg" → "5mg/5mg").
export function strengthParam(size: Pick<SizeOption, "label">): string {
  return size.label.toLowerCase().replace(/\s+/g, "");
}

// The strength a ?strength= value names, among the sizes on sale. Accepts the
// label form above, the permanent id or the SKU code. Anything else — missing,
// misspelt, outdated, or a deactivated strength (not in `sizes`) — falls back
// to the default strength, so an old link never breaks the page.
export function resolveStrength<S extends SizeOption>(
  product: Pick<Product, "availabilityStatus">,
  sizes: S[],
  param: string | null | undefined
): S | undefined {
  const p = (param ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (p) {
    const byLabel = sizes.filter((s) => strengthParam(s) === p);
    if (byLabel.length === 1) return byLabel[0];
    const byId = sizes.find((s) => s.id && s.id.toLowerCase() === p);
    if (byId) return byId;
    const bySku = sizes.find((s) => s.sku && s.sku.toLowerCase() === p);
    if (bySku) return bySku;
  }
  return defaultStrength(product, sizes);
}

// The strength a cart item or order line refers to, among the sizes on sale
// (active and priced): by its permanent id when it carries one, else by label.
// An id that is no longer on sale never falls back to a label match.
export function findStrength<S extends SizeOption>(
  sizes: S[],
  ref: { strengthId?: string; sizeLabel: string }
): S | undefined {
  return ref.strengthId ? sizes.find((s) => s.id === ref.strengthId) : sizes.find((s) => s.label === ref.sizeLabel);
}

// The parameter to write for a strength: its label form, unless two strengths
// of the product share it (e.g. "10mg" and "10 mg"), then its permanent id.
export function strengthUrlValue(size: SizeOption, sizes: SizeOption[]): string {
  const p = strengthParam(size);
  return sizes.filter((s) => strengthParam(s) === p).length > 1 && size.id ? size.id : p;
}

// The image sources for a strength, in fallback order: its own vial image,
// then the product photo(s). ProductGallery/ProductImage drop any that fail
// to load, ending at the placeholder — never a broken or blank image.
export function strengthImageSources(
  size: Pick<SizeOption, "imageUrl"> | undefined,
  productSources: string[]
): string[] {
  return [...new Set([size?.imageUrl, ...productSources].filter((s): s is string => Boolean(s)))];
}
