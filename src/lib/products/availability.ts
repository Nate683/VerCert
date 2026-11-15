import type { Product, SizeOption } from "@/lib/types";
import { pricedSizes } from "./pricing";
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

// Stage 1: status belongs to each strength (product_strengths). The product's
// own column is kept, unchanged, only as the fallback for a strength saved
// before strengths had a status; it never overrides a strength's own value.
export function strengthStatus(
  product: Pick<Product, "availabilityStatus">,
  size: Pick<SizeOption, "availabilityStatus"> | undefined
): AvailabilityStatus {
  return size?.availabilityStatus ?? product.availabilityStatus ?? DEFAULT_AVAILABILITY_STATUS;
}

// The strength a product page opens on (and the one a product-wide summary
// speaks for): the first active, priced strength marked In Stock, else the
// first active, priced strength. Never a deactivated one (pricedSizes leaves
// those out). Undefined when nothing is on sale.
export function defaultStrength<S extends SizeOption>(
  product: Pick<Product, "availabilityStatus">,
  sizes: S[]
): S | undefined {
  return sizes.find((s) => strengthStatus(product, s) === "in_stock") ?? sizes[0];
}

// A product-wide status, for places that show one per product (catalog cards,
// certificate notes, structured data): that of the default strength. With no
// sizes loaded, the product's own column.
export function availabilityStatus(product: Pick<Product, "availabilityStatus"> & Partial<Pick<Product, "sizes">>): AvailabilityStatus {
  if (!product.sizes) return product.availabilityStatus ?? DEFAULT_AVAILABILITY_STATUS;
  return strengthStatus(product, defaultStrength(product, pricedSizes({ sizes: product.sizes })));
}

// The one purchase rule, used by the product page, Reorder, order creation and
// subscription renewals: the selected strength is In Stock, AND the sitewide
// ordering switch is on (lib/ordering.ts), AND that strength has units. A
// strength's status never bypasses the switch. No inventory row = zero units.
export function isPurchasable(
  product: Pick<Product, "availabilityStatus">,
  size: Pick<SizeOption, "availabilityStatus" | "active"> | undefined,
  stock: StockState | undefined,
  orderingEnabled: boolean
): boolean {
  if (!size || size.active === false) return false;
  return strengthStatus(product, size) === "in_stock" && orderingEnabled && (stock?.remaining ?? 0) > 0;
}

// What the storefront says about a product. "In Stock" defers to the actual
// inventory, so a size with no units left reads "Out of Stock" and a low one
// gives its count; the stored status isn't changed by this.
export function availabilityLabel(product: Pick<Product, "availabilityStatus">, stock: StockState | undefined): string {
  const status = availabilityStatus(product);
  if (status !== "in_stock") return AVAILABILITY_LABELS[status];
  return stock ? stockLabel(stock) : AVAILABILITY_LABELS.out_of_stock;
}
