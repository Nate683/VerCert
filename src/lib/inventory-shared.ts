// Stage 2 inventory: the client-safe vocabulary shared by the server (lib/inventory.ts), the API routes and the
// Executive Office Stock tab. Stock is per strength (strength_inventory, keyed by the strength's permanent id).
//
//   available to sell = physical − reserved        (computed here and in SQL, never stored)
//
// reserved is always 0 in Stage 2: nothing in the application increments it (see the Stage 2 report). The database
// keeps physical ≥ 0, reserved ≥ 0 and reserved ≤ physical, so available can't go negative.

export type MovementType =
  | "opening_balance"
  | "stock_received"
  | "stock_removed"
  | "count_correction"
  | "threshold_changed"
  | "order_deducted"
  | "order_restored";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  opening_balance: "Opening balance",
  stock_received: "Stock received",
  stock_removed: "Stock removed",
  count_correction: "Count corrected",
  threshold_changed: "Low-stock threshold changed",
  order_deducted: "Order deducted",
  order_restored: "Order restored",
};

// The adjustments an administrator can make, and the reasons each accepts. "Other" requires a note.
export const ADJUSTMENT_TYPES = ["stock_received", "stock_removed", "count_correction"] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_REASONS: Record<AdjustmentType, readonly string[]> = {
  stock_received: ["Received from supplier", "Returned to stock", "Other"],
  stock_removed: ["Damaged", "Expired", "Testing sample", "Lost or missing", "Other"],
  count_correction: ["Physical count", "Data entry correction", "Other"],
};

export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  stock_received: "Add stock",
  stock_removed: "Remove stock",
  count_correction: "Correct count",
};

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

// Zero stock: nothing available. Low: available at or under the strength's threshold. Healthy: above it.
export type StockLevel = "healthy" | "low" | "zero";
export function stockLevel(available: number, threshold: number): StockLevel {
  if (available <= 0) return "zero";
  return available <= threshold ? "low" : "healthy";
}
export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = { healthy: "Healthy", low: "Low stock", zero: "Zero stock" };

// One strength's stock row, as the Executive Office sees it.
export type StrengthStockRow = {
  strengthId: string;
  sku: string;
  productSlug: string;
  productName: string;
  productActive: boolean;
  label: string;
  strengthActive: boolean;
  availabilityStatus: string;
  physical: number;
  reserved: number;
  available: number;
  threshold: number;
  level: StockLevel;
  version: number;
  updatedAt: string | null;
};

export type InventoryMovement = {
  id: string;
  strengthId: string;
  sku: string;
  productSlug: string;
  strengthLabel: string;
  type: MovementType;
  change: number;
  previous: number;
  resulting: number;
  reason: string;
  note: string | null;
  actor: string;
  reference: string | null;
  createdAt: string;
};
