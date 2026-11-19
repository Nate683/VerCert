import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { CartItem, Product } from "@/lib/types";
import { combinedStockState, stockState, type StockState } from "@/lib/products/stock";
import { pricedSizes } from "@/lib/products/pricing";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  stockLevel,
  type AdjustmentType,
  type InventoryLot,
  type InventoryMovement,
  type LotReleaseStatus,
  type LotTestingStatus,
  type MovementType,
  type ReservationRow,
  type StrengthStockRow,
  type SweepHeartbeat,
} from "@/lib/inventory-shared";

// Server-only. Stock per strength (strength_inventory, Stage 2) and per manufacturing lot (inventory_lots, Stage 3),
// with every change recorded in inventory_movements — the one ledger (append-only: the database rejects UPDATE and
// DELETE there).
//
// Since Stage 3 every stock change is ONE call to a database function (scripts/stage3-sql.mjs): it locks the
// strength, checks every bound, changes the SKU row and the lot together and records the movement, in one
// statement. The database also refuses, at commit, any state where a strength's totals differ from the sum of its
// lots. This file validates input, calls those functions and turns their errors into HTTP answers.
//
// - available = physical − reserved (every lot). sellable = approved lots only, expired holds counted as free.
//   The shop and checkout read sellable.
// - The legacy `inventory` table (slug, size_label) is no longer read or written. It is kept, frozen, for rollback.

export type LowInventoryAlert = { slug: string; name: string; quantity: number; threshold: number };

type StockRowDb = {
  strength_id: string;
  sku: string;
  product_slug: string;
  product_name: string;
  product_active: boolean | string;
  label: string;
  strength_active: boolean | string;
  availability_status: string;
  physical_quantity: number | string | null;
  reserved_quantity: number | string | null;
  low_stock_threshold: number | string | null;
  version: number | string | null;
  updated_at: string | null;
  sellable: number | string | null;
  expired_holds: number | string | null;
  expired_all: number | string | null;
  lot_count: number | string | null;
};

const bool = (v: boolean | string | null | undefined) => v === true || v === "t" || v === "true";
const num = (v: number | string | null | undefined, fallback = 0) => (v === null || v === undefined ? fallback : Number(v));

// Every strength, with its stock (a strength with no stock row reads as 0 / default threshold) and its sellable units.
const STOCK_SELECT = `
  SELECT s.id AS strength_id, s.sku, s.product_slug, p.name AS product_name, p.active AS product_active, s.label,
         s.active AS strength_active, s.availability_status,
         si.physical_quantity, si.reserved_quantity, si.low_stock_threshold, si.version, si.updated_at,
         COALESCE(v.sellable, 0) AS sellable, COALESCE(v.expired_holds, 0) AS expired_holds, COALESCE(v.expired_all, 0) AS expired_all,
         (SELECT count(*) FROM inventory_lots l WHERE l.strength_id = s.id) AS lot_count
    FROM product_strengths s
    JOIN products p ON p.slug = s.product_slug
    LEFT JOIN strength_inventory si ON si.strength_id = s.id
    LEFT JOIN vc_sellable() v ON v.strength_id = s.id`;

function toRow(r: StockRowDb): StrengthStockRow {
  const physical = num(r.physical_quantity);
  const reserved = num(r.reserved_quantity);
  const threshold = num(r.low_stock_threshold, DEFAULT_LOW_STOCK_THRESHOLD);
  const sellable = Math.max(0, num(r.sellable));
  return {
    strengthId: r.strength_id,
    sku: r.sku,
    productSlug: r.product_slug,
    productName: r.product_name,
    productActive: bool(r.product_active),
    label: r.label,
    strengthActive: bool(r.strength_active),
    availabilityStatus: r.availability_status,
    physical,
    reserved,
    // Evaluated against the clock on every read (owner requirement): a hold whose time has run out no longer
    // counts, even before the sweep releases it. `reserved` itself stays the stored figure, so the gap is visible.
    available: Math.max(0, physical - reserved + num(r.expired_all)),
    sellable,
    expiredHolds: num(r.expired_holds),
    lotCount: num(r.lot_count),
    threshold,
    level: stockLevel(sellable, threshold),
    version: num(r.version),
    updatedAt: r.updated_at,
  };
}

export async function listStrengthStock(): Promise<StrengthStockRow[]> {
  const rows = await query<StockRowDb>(`${STOCK_SELECT} ORDER BY p.sort_order, p.name, s.position`);
  return rows.map(toRow);
}

export async function getStrengthStock(strengthId: string): Promise<StrengthStockRow | null> {
  const rows = await query<StockRowDb>(`${STOCK_SELECT} WHERE s.id = $1`, [strengthId]);
  return rows[0] ? toRow(rows[0]) : null;
}

type MovementDb = {
  id: string; strength_id: string; sku: string; product_slug: string; strength_label: string; movement_type: MovementType;
  quantity_change: number | string; previous_quantity: number | string; resulting_quantity: number | string;
  reason: string; note: string | null; actor: string; reference: string | null; created_at: string;
  lot_id: string | null; lot_code: string | null; order_id: string | null; reserved_change: number | string | null;
  previous_reserved: number | string | null; resulting_reserved: number | string | null;
  lot_quantity_change: number | string | null; lot_previous_quantity: number | string | null; lot_resulting_quantity: number | string | null;
};
const n0 = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
const toMovement = (m: MovementDb): InventoryMovement => ({
  id: m.id, strengthId: m.strength_id, sku: m.sku, productSlug: m.product_slug, strengthLabel: m.strength_label, type: m.movement_type,
  change: Number(m.quantity_change), previous: Number(m.previous_quantity), resulting: Number(m.resulting_quantity),
  reason: m.reason, note: m.note, actor: m.actor, reference: m.reference, createdAt: m.created_at,
  lotId: m.lot_id ?? null, lotCode: m.lot_code ?? null, orderId: m.order_id ?? null, reservedChange: num(m.reserved_change),
  previousReserved: n0(m.previous_reserved), resultingReserved: n0(m.resulting_reserved),
  lotChange: n0(m.lot_quantity_change), lotPrevious: n0(m.lot_previous_quantity), lotResulting: n0(m.lot_resulting_quantity),
});

// Newest first. One strength's history, one lot's, one order's, or the most recent across every strength.
export async function listMovements(opts: { strengthId?: string; lotId?: string; orderId?: string; limit?: number } = {}): Promise<InventoryMovement[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const where = opts.strengthId ? "WHERE strength_id = $2" : opts.lotId ? "WHERE lot_id = $2" : opts.orderId ? "WHERE order_id = $2" : "";
  const arg = opts.strengthId ?? opts.lotId ?? opts.orderId;
  const rows = await query<MovementDb>(
    `SELECT * FROM inventory_movements ${where} ORDER BY created_at DESC, id DESC LIMIT $1`,
    arg ? [limit, arg] : [limit]
  );
  return rows.map(toMovement);
}

export type InventoryErrorCode = "not_found" | "insufficient" | "stale" | "duplicate" | "invalid" | "invalid_state" | "integrity";
export class InventoryError extends Error {
  readonly status: number;
  readonly code: InventoryErrorCode;
  constructor(message: string, status: number, code: InventoryErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The database functions' SQLSTATEs (scripts/stage3-sql.mjs) → HTTP. Anything else is re-thrown as a real error.
const SQLSTATE: Record<string, [number, InventoryErrorCode]> = {
  P0002: [404, "not_found"], P0003: [409, "insufficient"], P0004: [400, "invalid"], P0005: [409, "invalid_state"],
  P0006: [409, "stale"], "23505": [409, "duplicate"],
};
export function toInventoryError(err: unknown): InventoryError | null {
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e?.code && SQLSTATE[e.code]) {
    const [status, code] = SQLSTATE[e.code];
    const message = e.code === "23505"
      ? /payment_reference/.test(`${e.constraint ?? ""} ${e.message ?? ""}`)
        ? "That confirmation reference is already recorded on another order. Check the reference; nothing was changed."
        : "This change was already recorded (duplicate submission). Nothing more was changed."
      : (e.message ?? "The change couldn't be recorded.");
    return new InventoryError(message, status, code);
  }
  if (e?.code === "23514" && /inventory_unreconciled/.test(e.message ?? "")) {
    return new InventoryError("The stock change was refused because it would leave the SKU and its lots out of step. Nothing was changed.", 500, "integrity");
  }
  return null;
}

// Calls a database function. A deadlock (40P01) or serialization failure (40001) is retried once: every function is
// idempotent, so a retry can't apply anything twice.
export async function callDb<T = Record<string, unknown>>(text: string, params: unknown[]): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await query<T>(text, params);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if ((code === "40P01" || code === "40001") && attempt === 0) continue;
      throw toInventoryError(err) ?? err;
    }
  }
}

// --- Administrator adjustments (Executive Office → Stock) --------------------------------------------------------
// Since Stage 3 every adjustment names the lot it applies to; units received as a NEW lot go through receiveLot.
export async function adjustStock(input: {
  lotId: string;
  type: AdjustmentType;
  quantity: number;
  reason: string;
  note?: string | null;
  actor: string;
  idempotencyKey: string;
  expectedVersion?: number | null;
}): Promise<InventoryMovement> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0 || (input.type !== "count_correction" && input.quantity === 0)) {
    throw new InventoryError("Enter a whole number of units (at least 1 to add or remove).", 400, "invalid");
  }
  const rows = await callDb<MovementDb>("SELECT (vc_lot_adjust($1, $2, $3, $4::int, $5, $6, $7, $8)).*",
    [input.lotId, input.type, input.quantity, input.expectedVersion ?? null, input.reason, input.note ?? null, input.actor, `admin:${input.idempotencyKey}`]);
  return toMovement(rows[0]);
}

// Changes a strength's low-stock threshold, recorded as a movement with no quantity change (unchanged from Stage 2).
export async function setLowStockThreshold(input: {
  strengthId: string;
  threshold: number;
  note?: string | null;
  actor: string;
  idempotencyKey: string;
}): Promise<InventoryMovement> {
  const now = new Date().toISOString();
  let rows: MovementDb[];
  try {
    rows = await query<MovementDb>(
      `WITH cur AS (
         SELECT si.strength_id, si.low_stock_threshold AS old_threshold FROM strength_inventory si WHERE si.strength_id = $1 FOR UPDATE
       ), upd AS (
         UPDATE strength_inventory si SET low_stock_threshold = $2, version = si.version + 1, updated_at = $3
           FROM cur WHERE si.strength_id = cur.strength_id
         RETURNING si.strength_id, si.physical_quantity AS qty, si.reserved_quantity AS res, cur.old_threshold
       )
       INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change,
                                        previous_quantity, resulting_quantity, reason, note, actor, reference, idempotency_key, created_at,
                                        reserved_change, previous_reserved, resulting_reserved)
       SELECT $4, upd.strength_id, s.sku, s.product_slug, s.label, 'threshold_changed', 0, upd.qty, upd.qty,
              'Low-stock threshold ' || upd.old_threshold || ' → ' || $2, $5, $6, NULL, $7, $3, 0, upd.res, upd.res
         FROM upd JOIN product_strengths s ON s.id = upd.strength_id
       RETURNING *`,
      [input.strengthId, input.threshold, now, randomUUID(), input.note ?? null, input.actor, `admin:${input.idempotencyKey}`]
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new InventoryError("This change was already recorded (duplicate submission).", 409, "duplicate");
    throw err;
  }
  if (!rows[0]) throw new InventoryError("No stock record for this strength.", 404, "not_found");
  return toMovement(rows[0]);
}

// Statements that open stock for a strength created in the product editor: 0 units, the default threshold, and an
// opening-balance movement. Run in the same transaction that inserts the strength (lib/products/strength-store.ts).
// A strength at 0 needs no lot; its first stock arrives as a received lot.
export function openingStockStatements(strengthId: string, sku: string, slug: string, label: string, now: string) {
  return [
    {
      text: "INSERT INTO strength_inventory (strength_id, physical_quantity, reserved_quantity, low_stock_threshold, version, created_at, updated_at) VALUES ($1, 0, 0, $2, 0, $3, $3)",
      params: [strengthId, DEFAULT_LOW_STOCK_THRESHOLD, now],
    },
    {
      text: `INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change, previous_quantity,
               resulting_quantity, reason, note, actor, reference, idempotency_key, created_at, reserved_change, previous_reserved, resulting_reserved)
             VALUES ($1, $2, $3, $4, $5, 'opening_balance', 0, 0, 0, 'Strength created', NULL, 'system:product-editor', NULL, $6, $7, 0, 0, 0)`,
      params: [randomUUID(), strengthId, sku, slug, label, `opening:${strengthId}`, now],
    },
  ];
}

// --- Lots -------------------------------------------------------------------------------------------------------
type LotDb = {
  id: string; lot_code: string; strength_id: string; sku: string; kind: InventoryLot["kind"]; manufacturer_lot: string | null;
  vericert_lot_number: string | null; received_quantity: number | string; physical_quantity: number | string; reserved_quantity: number | string;
  received_at: string; manufactured_on: string | null; expires_on: string | null; testing_status: LotTestingStatus; release_status: LotReleaseStatus;
  release_changed_at: string | null; release_changed_by: string | null; release_reason: string | null; notes: string | null;
  version: number | string; eligible: boolean | string; created_at: string; created_by: string; certificates: string | null;
};
const toLot = (l: LotDb): InventoryLot => ({
  id: l.id, lotCode: l.lot_code, strengthId: l.strength_id, sku: l.sku, kind: l.kind, manufacturerLot: l.manufacturer_lot,
  vericertLotNumber: l.vericert_lot_number, receivedQuantity: Number(l.received_quantity), physical: Number(l.physical_quantity),
  reserved: Number(l.reserved_quantity), receivedAt: l.received_at, manufacturedOn: l.manufactured_on, expiresOn: l.expires_on,
  testingStatus: l.testing_status, releaseStatus: l.release_status, releaseChangedAt: l.release_changed_at,
  releaseChangedBy: l.release_changed_by, releaseReason: l.release_reason, notes: l.notes, version: Number(l.version),
  eligible: bool(l.eligible), createdAt: l.created_at, createdBy: l.created_by,
  certificates: l.certificates ? JSON.parse(l.certificates) : [],
});

// A strength's lots in FIFO order, each with the certificate records filed under its VeriCert lot number (read only).
export async function listLots(strengthId: string): Promise<InventoryLot[]> {
  const rows = await query<LotDb>(
    `SELECT l.*, vc_lot_eligible(l.release_status, l.testing_status, l.expires_on) AS eligible,
            (SELECT json_agg(json_build_object('id', r.id, 'labReportId', r.lab_report_id, 'approvalStatus', r.approval_status,
                                               'publicVisibility', r.public_visibility, 'isTest', COALESCE(r.is_test, false)) ORDER BY r.created_at)::text
               FROM coa_records r
              WHERE l.vericert_lot_number IS NOT NULL AND upper(r.lot_number) = upper(l.vericert_lot_number) AND r.deleted_at IS NULL) AS certificates
       FROM inventory_lots l WHERE l.strength_id = $1 ORDER BY l.received_at, l.id`,
    [strengthId]
  );
  return rows.map(toLot);
}

export async function getLot(lotId: string): Promise<InventoryLot | null> {
  const [row] = await query<{ strength_id: string }>("SELECT strength_id FROM inventory_lots WHERE id = $1", [lotId]);
  if (!row) return null;
  return (await listLots(row.strength_id)).find((l) => l.id === lotId) ?? null;
}

export type LotDetailsInput = {
  manufacturerLot?: string | null;
  vericertLotNumber?: string | null;
  receivedAt?: string | null;
  manufacturedOn?: string | null;
  expiresOn?: string | null;
  notes?: string | null;
};

// Units arriving from a supplier: a new lot (pending, untested — never sellable until approved).
export async function receiveLot(input: { strengthId: string; quantity: number; actor: string; idempotencyKey: string } & LotDetailsInput) {
  const [r] = await callDb<{ r: { outcome: string; lot_id: string; lot_code?: string } }>(
    "SELECT vc_lot_receive($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10) AS r",
    [input.strengthId, input.quantity, input.manufacturerLot ?? null, input.vericertLotNumber ?? null, input.receivedAt ?? null,
      input.manufacturedOn ?? null, input.expiresOn ?? null, input.notes ?? null, input.actor, input.idempotencyKey]
  );
  return r.r;
}

// Moves units out of a lot (typically RECON-<SKU>) into a new lot with real batch details. SKU total unchanged.
export async function splitLot(input: { fromLotId: string; quantity: number; reason: string; actor: string; idempotencyKey: string } & LotDetailsInput) {
  const [r] = await callDb<{ r: { outcome: string; lot_id: string; lot_code?: string } }>(
    "SELECT vc_lot_split($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11) AS r",
    [input.fromLotId, input.quantity, input.manufacturerLot ?? null, input.vericertLotNumber ?? null, input.receivedAt ?? null,
      input.manufacturedOn ?? null, input.expiresOn ?? null, input.notes ?? null, input.actor, input.reason, input.idempotencyKey]
  );
  return r.r;
}

// Release/testing status and descriptive details. Approval rules are enforced in the database (vc_lot_update).
export async function updateLot(input: {
  lotId: string; releaseStatus?: LotReleaseStatus; testingStatus?: LotTestingStatus; reason?: string | null; actor: string; idempotencyKey: string;
} & LotDetailsInput) {
  const [r] = await callDb<{ r: { outcome: string; changes?: string[]; orders_on_hold?: number; held_orders?: string[] } }>(
    "SELECT vc_lot_update($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11) AS r",
    [input.lotId, input.releaseStatus ?? null, input.testingStatus ?? null, input.manufacturerLot ?? null, input.vericertLotNumber ?? null,
      input.manufacturedOn ?? null, input.expiresOn ?? null, input.notes ?? null, input.reason ?? null, input.actor, input.idempotencyKey]
  );
  return r.r;
}

// --- Reservations ------------------------------------------------------------------------------------------------
// Every live reservation (held, not yet committed or released), soonest expiry first. Ones past their expiry that
// no sweep has released yet come back with expired = true.
export async function listReservations(): Promise<ReservationRow[]> {
  const rows = await query<{
    id: string; order_id: string; order_reference: string; line_index: number | string; strength_id: string; sku: string; lot_id: string;
    lot_code: string; quantity: number | string; created_at: string; expires_at: string; expired: boolean | string; payment_method: string; payment_status: string;
  }>(
    `SELECT a.id, a.order_id, a.order_reference, a.line_index, a.strength_id, a.sku, a.lot_id, a.lot_code, a.quantity, a.created_at, a.expires_at,
            (a.expires_at <= vc_now()) AS expired, o.payment_method, o.payment_status
       FROM inventory_allocations a JOIN orders o ON o.id = a.order_id
      WHERE a.state = 'reserved'
      ORDER BY a.expires_at, a.created_at`
  );
  return rows.map((r) => ({
    id: r.id, orderId: r.order_id, orderReference: r.order_reference, lineIndex: Number(r.line_index), strengthId: r.strength_id, sku: r.sku,
    lotId: r.lot_id, lotCode: r.lot_code, quantity: Number(r.quantity), createdAt: r.created_at, expiresAt: r.expires_at, expired: bool(r.expired),
    paymentMethod: r.payment_method, paymentStatus: r.payment_status,
  }));
}

export async function getSweepHeartbeat(): Promise<SweepHeartbeat> {
  const [r] = await query<{ last_cron: string | null; last_any: string | null; last_source: string | null; runs: number | string }>(
    `SELECT (SELECT max(started_at) FROM job_runs WHERE job = 'reservation_sweep' AND source = 'cron') AS last_cron,
            (SELECT started_at FROM job_runs WHERE job = 'reservation_sweep' ORDER BY started_at DESC LIMIT 1) AS last_any,
            (SELECT source FROM job_runs WHERE job = 'reservation_sweep' ORDER BY started_at DESC LIMIT 1) AS last_source,
            (SELECT count(*) FROM job_runs WHERE job = 'reservation_sweep' AND started_at > $1) AS runs`,
    [new Date(Date.now() - 24 * 3600 * 1000).toISOString()]
  );
  return { lastCronRun: r?.last_cron ?? null, lastAnyRun: r?.last_any ?? null, lastAnySource: r?.last_source ?? null, runsLast24h: num(r?.runs) };
}

// Releases every reservation whose time has run out (and marks those orders expired). Safe to run any number of
// times. `source` is recorded in the heartbeat: cron | admin | checkout | order-page.
export async function sweepExpiredReservations(actor: string, source: string): Promise<number> {
  const [r] = await callDb<{ n: number | string }>("SELECT vc_reservations_sweep($1, $2) AS n", [actor, source]);
  return Number(r.n);
}

export async function releaseReservation(allocationId: string, actor: string, reason: string) {
  const [r] = await callDb<{ r: { outcome: string } }>("SELECT vc_allocation_release($1, $2, $3) AS r", [allocationId, actor, reason]);
  return r.r;
}

// --- Readers used by the storefront, checkout and the Executive Office -------------------------------------------

// Strengths at or under their low-stock threshold in SELLABLE units (active strengths of visible products), lowest first.
export async function getLowInventoryAlerts(): Promise<LowInventoryAlert[]> {
  const rows = await listStrengthStock();
  return rows
    .filter((r) => r.productActive && r.strengthActive && r.level !== "healthy")
    .map((r) => ({ slug: r.productSlug, name: `${r.productName} ${r.label}`, quantity: r.sellable, threshold: r.threshold }))
    .sort((a, b) => a.quantity - b.quantity);
}

// Attaches stock for the storefront: per strength label (what the product page shows for the selected strength)
// and combined over the strengths on sale. Only SELLABLE units and a status reach the browser — never the
// threshold, reserved, physical or lot details.
export async function withStock<P extends Product>(products: P[]): Promise<P[]> {
  const rows = await listStrengthStock();
  const byId = new Map(rows.map((r) => [r.strengthId, r]));
  return products.map((p) => {
    const sizeStock: Record<string, StockState> = {};
    const levels: { quantity: number; threshold: number }[] = [];
    const onSale = pricedSizes(p);
    for (const size of onSale.length ? onSale : p.sizes) {
      const r = size.id ? byId.get(size.id) : undefined;
      const level = { quantity: r?.sellable ?? 0, threshold: r?.threshold ?? DEFAULT_LOW_STOCK_THRESHOLD };
      sizeStock[size.label] = stockState(level);
      levels.push(level);
    }
    return { ...p, sizeStock, stock: combinedStockState(levels) };
  });
}

// The strength a cart line or order line refers to: its permanent id, else (older lines) product + label.
async function resolveStrengthIds(items: Pick<CartItem, "slug" | "sizeLabel" | "strengthId">[]): Promise<(string | null)[]> {
  const rows = await query<{ id: string; product_slug: string; label: string }>(
    "SELECT id, product_slug, label FROM product_strengths WHERE product_slug = ANY($1)",
    [[...new Set(items.map((i) => i.slug))]]
  );
  return items.map((i) => i.strengthId ?? rows.find((r) => r.product_slug === i.slug && r.label === i.sizeLabel)?.id ?? null);
}

// The slugs whose strengths don't have enough SELLABLE stock for these items (empty = all can be filled). Advisory
// (no lock): the authoritative check is the reservation (reserving methods) or the deduction at payment (Zelle /
// bank transfer), both atomic in the database.
export async function findInsufficientStock(items: CartItem[]): Promise<string[]> {
  if (items.length === 0) return [];
  const ids = await resolveStrengthIds(items);
  const stock = new Map((await listStrengthStock()).map((r) => [r.strengthId, r]));
  const wanted = new Map<string, number>();
  const shortages = new Set<string>();
  items.forEach((item, i) => {
    const id = ids[i];
    if (!id || !stock.has(id)) return void shortages.add(item.slug);
    wanted.set(id, (wanted.get(id) ?? 0) + item.quantity);
  });
  for (const [id, qty] of wanted) {
    const r = stock.get(id)!;
    if (r.sellable < qty) shortages.add(r.productSlug);
  }
  return [...shortages];
}
