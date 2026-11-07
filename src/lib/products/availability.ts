import type { Product } from "@/lib/types";
import { stockLabel, type StockState } from "./stock";

// A product's availability status, set by hand in the Products tab. Client-safe.
//
// It is separate from two other things:
// - Visibility (products.active), which decides whether the product appears
//   in the shop at all. A hidden product can hold any status.
// - Inventory (the inventory table). Changing one never changes the other.
//
// Only "In Stock" can be bought, and only while ordering is enabled
// (lib/ordering.ts) and the size has units left. See isPurchasable.
export const AVAILABILITY_STATUSES = ["coming_soon", "pending_testing", "in_stock", "out_of_stock"] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  coming_soon: "Coming Soon",
  pending_testing: "Pending Independent Testing",
  in_stock: "In Stock",
  out_of_stock: "Out of Stock",
};

export const DEFAULT_AVAILABILITY_STATUS: AvailabilityStatus = "coming_soon";

export function availabilityStatus(product: Pick<Product, "availabilityStatus">): AvailabilityStatus {
  return product.availabilityStatus ?? DEFAULT_AVAILABILITY_STATUS;
}

// The one purchase rule, used by the product page, Reorder, order creation and
// subscription renewals. A product with no inventory row has zero units.
export function isPurchasable(
  product: Pick<Product, "availabilityStatus">,
  stock: StockState | undefined,
  orderingEnabled: boolean
): boolean {
  return availabilityStatus(product) === "in_stock" && orderingEnabled && (stock?.remaining ?? 0) > 0;
}

// What the storefront says about a product. "In Stock" defers to the actual
// inventory, so a size with no units left reads "Out of Stock" and a low one
// gives its count; the stored status isn't changed by this.
export function availabilityLabel(product: Pick<Product, "availabilityStatus">, stock: StockState | undefined): string {
  const status = availabilityStatus(product);
  if (status !== "in_stock") return AVAILABILITY_LABELS[status];
  return stock ? stockLabel(stock) : AVAILABILITY_LABELS.out_of_stock;
}
