import { products } from "@/lib/products";

// Mock on-hand quantities for the low-inventory alert — there's no real
// warehouse system wired in yet, so these are illustrative fixed values.
const INVENTORY_LEVELS: Record<string, { quantity: number; threshold: number }> = {
  "bpc-157": { quantity: 42, threshold: 20 },
  "tb-500": { quantity: 18, threshold: 20 },
  semaglutide: { quantity: 65, threshold: 25 },
  tirzepatide: { quantity: 12, threshold: 20 },
  epithalon: { quantity: 8, threshold: 15 },
  selank: { quantity: 30, threshold: 15 },
  "nad-plus": { quantity: 5, threshold: 15 },
  "ghk-cu": { quantity: 50, threshold: 20 },
  "aod-9604": { quantity: 22, threshold: 15 },
  "ipamorelin-cjc-1295-blend": { quantity: 9, threshold: 15 },
};

export type LowInventoryAlert = {
  slug: string;
  name: string;
  quantity: number;
  threshold: number;
};

export function getLowInventoryAlerts(): LowInventoryAlert[] {
  return products
    .map((product) => {
      const level = INVENTORY_LEVELS[product.slug];
      if (!level) return null;
      if (level.quantity > level.threshold) return null;
      return { slug: product.slug, name: product.name, ...level };
    })
    .filter((alert): alert is LowInventoryAlert => alert !== null)
    .sort((a, b) => a.quantity - b.quantity);
}

export function getInventoryLevel(slug: string) {
  return INVENTORY_LEVELS[slug];
}
