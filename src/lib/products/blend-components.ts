import type { Product } from "@/lib/types";
import { isOnSale } from "./store";
import { productImageSources } from "./images";

// What a blend's component card can show about one compound in it.
export type BlendComponentInfo = {
  imageUrl?: string;
  // Only set when that product is on sale, so a card never links to a 404.
  href?: string;
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Matches each compound named in a blend's composition to a catalog product
// by its name or one of its alternate names, ignoring case and punctuation
// ("Ipamorelin" ↔ "ipamorelin"). Nothing looser: "CJC-1295" does not match
// "CJC-1295 without DAC". Add an alternate name in /command to link one.
export function blendComponents(blend: Product, catalog: Product[]): Record<string, BlendComponentInfo> {
  const byName = new Map<string, Product>();
  for (const p of catalog) {
    if (p.slug === blend.slug) continue;
    for (const n of [p.name, ...(p.alternateNames ?? [])]) if (!byName.has(key(n))) byName.set(key(n), p);
  }

  const out: Record<string, BlendComponentInfo> = {};
  for (const size of blend.sizes) {
    for (const c of size.composition ?? []) {
      const match = byName.get(key(c.name));
      out[c.name] = match
        ? { imageUrl: productImageSources(match)[0], href: isOnSale(match) ? `/shop/${match.slug}` : undefined }
        : {};
    }
  }
  return out;
}
