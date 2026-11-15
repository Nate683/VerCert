import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { CartItem, Product } from "@/lib/types";
import { combinedStockState, stockState, type StockState } from "@/lib/products/stock";
import { pricedSizes } from "@/lib/products/pricing";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  stockLevel,
  type AdjustmentType,
  type InventoryMovement,
  type MovementType,
  type StrengthStockRow,
} from "@/lib/inventory-shared";

// Server-only. Stage 2: stock per strength, in strength_inventory (keyed by the strength's permanent id), with every
// change recorded in inventory_movements (append-only: the database rejects UPDATE and DELETE there).
//
// - available = physical − reserved. reserved is never incremented in Stage 2 — no function here or anywhere in the
//   application writes it except the migration, which set it to 0.
// - Every change goes through applyMovement: ONE SQL statement that locks the strength's row (FOR UPDATE), checks
//   the guard, updates the row and inserts the movement together. Concurrent changes to the same strength are
//   serialized by the row lock and each sees the other's result; a failed guard changes nothing; a repeated
//   idempotency key (a double submission) is rejected by the unique index and changes nothing.
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
};

const bool = (v: boolean | string) => v === true || v === "t" || v === "true";
const num = (v: number | string | null | undefined, fallback = 0) => (v === null || v === undefined ? fallback : Number(v));

// Every strength, with its stock (a strength with no stock row reads as 0 / default threshold).
const STOCK_SELECT = `
  SELECT s.id AS strength_id, s.sku, s.product_slug, p.name AS product_name, p.active AS product_active, s.label,
         s.active AS strength_active, s.availability_status,
         si.physical_quantity, si.reserved_quantity, si.low_stock_threshold, si.version, si.updated_at
    FROM product_strengths s
    JOIN products p ON p.slug = s.product_slug
    LEFT JOIN strength_inventory si ON si.strength_id = s.id`;

function toRow(r: StockRowDb): StrengthStockRow {
  const physical = num(r.physical_quantity);
  const reserved = num(r.reserved_quantity);
  const threshold = num(r.low_stock_threshold, DEFAULT_LOW_STOCK_THRESHOLD);
  const available = Math.max(0, physical - reserved);
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
    available,
    threshold,
    level: stockLevel(available, threshold),
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
};
const toMovement = (m: MovementDb): InventoryMovement => ({
  id: m.id, strengthId: m.strength_id, sku: m.sku, productSlug: m.product_slug, strengthLabel: m.strength_label, type: m.movement_type,
  change: Number(m.quantity_change), previous: Number(m.previous_quantity), resulting: Number(m.resulting_quantity),
  reason: m.reason, note: m.note, actor: m.actor, reference: m.reference, createdAt: m.created_at,
});

// Newest first. One strength's history, or the most recent across every strength.
export async function listMovements(opts: { strengthId?: string; limit?: number } = {}): Promise<InventoryMovement[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const rows = await query<MovementDb>(
    `SELECT * FROM inventory_movements ${opts.strengthId ? "WHERE strength_id = $2" : ""} ORDER BY created_at DESC, id DESC LIMIT $1`,
    opts.strengthId ? [limit, opts.strengthId] : [limit]
  );
  return rows.map(toMovement);
}

export class InventoryError extends Error {
  readonly status: number;
  readonly code: "not_found" | "insufficient" | "stale" | "duplicate" | "invalid";
  constructor(message: string, status: number, code: InventoryError["code"]) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The one write path for stock. `next` and `guard` are SQL over `si` (the locked strength_inventory row) and the
// statement's parameters ($1 strength id, $2 amount, $3 expected version or NULL).
type Spec = { next: string; guard: string };
const SPECS: Record<Exclude<MovementType, "opening_balance" | "threshold_changed">, Spec> = {
  stock_received: { next: "si.physical_quantity + $2", guard: "TRUE" },
  // Never below what is reserved: only available stock can be removed.
  stock_removed: { next: "si.physical_quantity - $2", guard: "si.physical_quantity - si.reserved_quantity >= $2" },
  // Sets the count; refused if the row changed since the administrator read it (expected version).
  count_correction: { next: "$2", guard: "$2 >= si.reserved_quantity AND ($3::int IS NULL OR si.version = $3::int)" },
  // Paying an order (lib/orders/lifecycle.ts): as before Stage 2, never below zero — and never below reserved.
  order_deducted: { next: "GREATEST(si.reserved_quantity, si.physical_quantity - $2)", guard: "TRUE" },
  order_restored: { next: "si.physical_quantity + $2", guard: "TRUE" },
};

async function applyMovement(input: {
  strengthId: string;
  type: keyof typeof SPECS;
  amount: number;
  reason: string;
  note?: string | null;
  actor: string;
  reference?: string | null;
  idempotencyKey: string;
  expectedVersion?: number | null;
}): Promise<InventoryMovement> {
  const spec = SPECS[input.type];
  const now = new Date().toISOString();
  let rows: MovementDb[];
  try {
    rows = await query<MovementDb>(
      // $3 (expected version) is always typed here: only some guards use it, and Postgres refuses a parameter it
      // can't infer a type for ("could not determine data type of parameter $3").
      `WITH cur AS (
         SELECT si.strength_id, si.physical_quantity AS old, $3::int AS expected_version
           FROM strength_inventory si WHERE si.strength_id = $1 FOR UPDATE
       ), upd AS (
         UPDATE strength_inventory si SET physical_quantity = ${spec.next}, version = si.version + 1, updated_at = $4
           FROM cur WHERE si.strength_id = cur.strength_id AND ${spec.guard}
         RETURNING si.strength_id, cur.old, si.physical_quantity AS new
       )
       INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change,
                                        previous_quantity, resulting_quantity, reason, note, actor, reference, idempotency_key, created_at)
       SELECT $5, upd.strength_id, s.sku, s.product_slug, s.label, $6, upd.new - upd.old, upd.old, upd.new, $7, $8, $9, $10, $11, $4
         FROM upd JOIN product_strengths s ON s.id = upd.strength_id
       RETURNING *`,
      [input.strengthId, input.amount, input.expectedVersion ?? null, now, randomUUID(), input.type, input.reason,
        input.note ?? null, input.actor, input.reference ?? null, input.idempotencyKey]
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new InventoryError("This change was already recorded (duplicate submission). Nothing more was changed.", 409, "duplicate");
    }
    throw err;
  }
  if (rows[0]) return toMovement(rows[0]);
  // Nothing written: say why.
  const row = await getStrengthStock(input.strengthId);
  if (!row || !(await query("SELECT 1 FROM strength_inventory WHERE strength_id = $1", [input.strengthId]))[0]) {
    throw new InventoryError("No stock record for this strength.", 404, "not_found");
  }
  if (input.type === "stock_removed") {
    throw new InventoryError(`Only ${row.available} available to remove (physical ${row.physical}, reserved ${row.reserved}). Nothing was changed.`, 409, "insufficient");
  }
  if (input.type === "count_correction") {
    if (input.amount < row.reserved) throw new InventoryError(`The count can't be below the ${row.reserved} reserved. Nothing was changed.`, 409, "insufficient");
    throw new InventoryError("This stock changed since you opened it. Reload to see the current count, then try again. Nothing was changed.", 409, "stale");
  }
  throw new InventoryError("The stock change couldn't be recorded. Nothing was changed.", 409, "invalid");
}

// An administrator's adjustment (Executive Office → Stock). Validated by the route; the reason is required.
export async function adjustStock(input: {
  strengthId: string;
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
  return applyMovement({ ...input, amount: input.quantity, idempotencyKey: `admin:${input.idempotencyKey}` });
}

// Changes a strength's low-stock threshold, recorded as a movement with no quantity change.
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
         RETURNING si.strength_id, si.physical_quantity AS qty, cur.old_threshold
       )
       INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change,
                                        previous_quantity, resulting_quantity, reason, note, actor, reference, idempotency_key, created_at)
       SELECT $4, upd.strength_id, s.sku, s.product_slug, s.label, 'threshold_changed', 0, upd.qty, upd.qty,
              'Low-stock threshold ' || upd.old_threshold || ' → ' || $2, $5, $6, NULL, $7, $3
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
export function openingStockStatements(strengthId: string, sku: string, slug: string, label: string, now: string) {
  return [
    {
      text: "INSERT INTO strength_inventory (strength_id, physical_quantity, reserved_quantity, low_stock_threshold, version, created_at, updated_at) VALUES ($1, 0, 0, $2, 0, $3, $3)",
      params: [strengthId, DEFAULT_LOW_STOCK_THRESHOLD, now],
    },
    {
      text: `INSERT INTO inventory_movements (id, strength_id, sku, product_slug, strength_label, movement_type, quantity_change, previous_quantity,
               resulting_quantity, reason, note, actor, reference, idempotency_key, created_at)
             VALUES ($1, $2, $3, $4, $5, 'opening_balance', 0, 0, 0, 'Strength created', NULL, 'system:product-editor', NULL, $6, $7)`,
      params: [randomUUID(), strengthId, sku, slug, label, `opening:${strengthId}`, now],
    },
  ];
}

// --- Readers used by the storefront, checkout and the Executive Office (same signatures as before Stage 2) ---

// Strengths at or under their low-stock threshold (active strengths of visible products), lowest first.
export async function getLowInventoryAlerts(): Promise<LowInventoryAlert[]> {
  const rows = await listStrengthStock();
  return rows
    .filter((r) => r.productActive && r.strengthActive && r.level !== "healthy")
    .map((r) => ({ slug: r.productSlug, name: `${r.productName} ${r.label}`, quantity: r.available, threshold: r.threshold }))
    .sort((a, b) => a.quantity - b.quantity);
}

// Attaches stock for the storefront: per strength label (what the product page shows for the selected strength)
// and combined over the strengths on sale. Only available-to-sell and a status reach the browser — never the
// threshold, reserved or physical counts.
export async function withStock<P extends Product>(products: P[]): Promise<P[]> {
  const rows = await listStrengthStock();
  const byId = new Map(rows.map((r) => [r.strengthId, r]));
  return products.map((p) => {
    const sizeStock: Record<string, StockState> = {};
    const levels: { quantity: number; threshold: number }[] = [];
    const onSale = pricedSizes(p);
    for (const size of onSale.length ? onSale : p.sizes) {
      const r = size.id ? byId.get(size.id) : undefined;
      const level = { quantity: r?.available ?? 0, threshold: r?.threshold ?? DEFAULT_LOW_STOCK_THRESHOLD };
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

// The slugs whose strengths don't have enough AVAILABLE stock for these items (empty = all can be filled).
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
    if (r.available < qty) shortages.add(r.productSlug);
  }
  return [...shortages];
}

// Paying an order deducts its lines; cancelling or refunding a paid order restores them (lib/orders/lifecycle.ts,
// unchanged in behaviour since before Stage 2). Each line is a recorded movement with the order reference. The
// idempotency key (order reference + line + direction) means a line is never deducted or restored twice.
export async function decrementStock(items: CartItem[], reference = "unknown-order"): Promise<void> {
  const ids = await resolveStrengthIds(items);
  for (const [i, item] of items.entries()) {
    if (!ids[i]) continue;
    await applyMovement({ strengthId: ids[i]!, type: "order_deducted", amount: item.quantity, reason: `Order ${reference} paid`,
      actor: "system:order", reference, idempotencyKey: `order:${reference}:${i}:deducted` }).catch((err) => {
      if (!(err instanceof InventoryError && err.code === "duplicate")) throw err;
    });
  }
}

export async function restoreStock(items: CartItem[], reference = "unknown-order"): Promise<void> {
  const ids = await resolveStrengthIds(items);
  for (const [i, item] of items.entries()) {
    if (!ids[i]) continue;
    await applyMovement({ strengthId: ids[i]!, type: "order_restored", amount: item.quantity, reason: `Order ${reference} cancelled or refunded`,
      actor: "system:order", reference, idempotencyKey: `order:${reference}:${i}:restored` }).catch((err) => {
      if (!(err instanceof InventoryError && err.code === "duplicate")) throw err;
    });
  }
}
