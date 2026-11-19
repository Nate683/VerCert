// Stage 2 inventory, extended in Stage 3: the client-safe vocabulary shared by the server (lib/inventory.ts), the API
// routes and the Executive Office Stock / Reservations tabs. Stock is per strength (strength_inventory, keyed by the
// strength's permanent id) and, since Stage 3, per manufacturing lot (inventory_lots). The database keeps a
// strength's physical and reserved equal to the sums over its lots.
//
//   available = physical − reserved                      (SKU level, every lot, as in Stage 2)
//   sellable  = Σ over APPROVED lots of (physical − reserved), counting an expired hold as free
//
// Only sellable stock can be ordered; the shop and checkout read sellable. Quarantined, pending and rejected lots
// (including each strength's reconciliation lot, RECON-<SKU>) are on hand but not for sale.

export type MovementType =
  | "opening_balance"
  | "stock_received"
  | "stock_removed"
  | "count_correction"
  | "threshold_changed"
  | "order_deducted"
  | "order_restored"
  | "reserved"
  | "released"
  | "committed"
  | "lot_reconciliation"
  | "lot_status"
  | "lot_updated"
  | "lot_transfer_out"
  | "lot_transfer_in"
  | "return_restocked"
  | "return_quarantined"
  | "reallocated_out"
  | "reallocated_in";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  opening_balance: "Opening balance",
  stock_received: "Stock received",
  stock_removed: "Stock removed",
  count_correction: "Count corrected",
  threshold_changed: "Low-stock threshold changed",
  order_deducted: "Order deducted",
  order_restored: "Order restored",
  reserved: "Reserved for order",
  released: "Reservation released",
  committed: "Reservation committed (paid)",
  lot_reconciliation: "Placed in reconciliation lot",
  lot_status: "Lot status changed",
  lot_updated: "Lot details changed",
  lot_transfer_out: "Moved to another lot",
  lot_transfer_in: "Moved from another lot",
  return_restocked: "Return restocked",
  return_quarantined: "Return quarantined",
  reallocated_out: "Reallocated away (lot no longer eligible)",
  reallocated_in: "Reallocated in (replacement lot)",
};

// The adjustments an administrator can make, and the reasons each accepts. "Other" requires a note.
export const ADJUSTMENT_TYPES = ["stock_received", "stock_removed", "count_correction"] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_REASONS: Record<AdjustmentType, readonly string[]> = {
  stock_received: ["Received from supplier", "Returned to stock", "Other"],
  // "Not physically received": for the pre-Stage-3 recorded quantities that were planned purchases, not stock on hand.
  stock_removed: ["Damaged", "Expired", "Testing sample", "Lost or missing", "Not physically received", "Other"],
  count_correction: ["Physical count", "Not physically received (planned quantity)", "Data entry correction", "Other"],
};

export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  stock_received: "Add stock",
  stock_removed: "Remove stock",
  count_correction: "Correct count",
};

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

// Zero stock: nothing sellable. Low: sellable at or under the strength's threshold. Healthy: above it.
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
  /** Units in approved lots not held by a live reservation — what can actually be ordered. */
  sellable: number;
  /** Units still held by reservations whose time has run out (released by the next sweep or checkout). */
  expiredHolds: number;
  lotCount: number;
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
  lotId: string | null;
  lotCode: string | null;
  orderId: string | null;
  reservedChange: number;
  previousReserved: number | null;
  resultingReserved: number | null;
  lotChange: number | null;
  lotPrevious: number | null;
  lotResulting: number | null;
};

// --- Lots (Stage 3) ---
export const LOT_RELEASE_STATUSES = ["pending", "quarantined", "approved", "rejected"] as const;
export type LotReleaseStatus = (typeof LOT_RELEASE_STATUSES)[number];
export const LOT_TESTING_STATUSES = ["untested", "in_testing", "passed", "failed"] as const;
export type LotTestingStatus = (typeof LOT_TESTING_STATUSES)[number];
export const LOT_RELEASE_LABELS: Record<LotReleaseStatus, string> = { pending: "Pending", quarantined: "Quarantined", approved: "Approved", rejected: "Rejected" };
export const LOT_TESTING_LABELS: Record<LotTestingStatus, string> = { untested: "Untested", in_testing: "In testing", passed: "Passed", failed: "Failed" };
export type LotKind = "received" | "reconciliation" | "returns";

export type InventoryLot = {
  id: string;
  lotCode: string;
  strengthId: string;
  sku: string;
  kind: LotKind;
  manufacturerLot: string | null;
  vericertLotNumber: string | null;
  receivedQuantity: number;
  physical: number;
  reserved: number;
  receivedAt: string;
  manufacturedOn: string | null;
  expiresOn: string | null;
  testingStatus: LotTestingStatus;
  releaseStatus: LotReleaseStatus;
  releaseChangedAt: string | null;
  releaseChangedBy: string | null;
  releaseReason: string | null;
  notes: string | null;
  version: number;
  eligible: boolean;
  createdAt: string;
  createdBy: string;
  /** Certificates on file for this lot's VeriCert lot number (read-only; never created or published from here). */
  certificates: { id: string; labReportId: string | null; approvalStatus: string | null; publicVisibility: string | null; isTest: boolean }[];
};

// --- Reservations (Stage 3) ---
export type ReservationRow = {
  id: string;
  orderId: string;
  orderReference: string;
  lineIndex: number;
  strengthId: string;
  sku: string;
  lotId: string;
  lotCode: string;
  quantity: number;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  paymentMethod: string;
  paymentStatus: string;
};

export type SweepHeartbeat = {
  lastCronRun: string | null;
  lastAnyRun: string | null;
  lastAnySource: string | null;
  runsLast24h: number;
};
