// Stock as customers see it, from the inventory table. Client-safe.
//
// Out of stock means zero units, and a product with no inventory row has zero
// units; checkout already refuses both (lib/inventory.ts
// findInsufficientStock), so the storefront must never call them in stock.
// Low stock is at or under the product's alert threshold, shown with the
// actual count.
export type StockState = { status: "in" | "low" | "out"; remaining: number };

export function stockState(level: { quantity: number; threshold: number } | undefined): StockState {
  const remaining = Math.max(0, level?.quantity ?? 0);
  if (remaining === 0) return { status: "out", remaining };
  if (level && remaining <= level.threshold) return { status: "low", remaining };
  return { status: "in", remaining };
}

export function stockLabel(stock: StockState): string {
  if (stock.status === "out") return "Out of Stock";
  if (stock.status === "low") return `Only ${stock.remaining} left`;
  return "In Stock";
}

export const SCHEMA_AVAILABILITY: Record<StockState["status"], string> = {
  in: "https://schema.org/InStock",
  low: "https://schema.org/LimitedAvailability",
  out: "https://schema.org/OutOfStock",
};
