import { query } from "@/lib/db";
import { listProducts } from "@/lib/products";
import type { CartItem, Product } from "@/lib/types";
import { combinedStockState, stockState, type StockState } from "@/lib/products/stock";

export type LowInventoryAlert = {
  slug: string;
  name: string;
  quantity: number;
  threshold: number;
};

// size_label '' is the product's shared stock, used by every size that has no
// row of its own. A size with its own row draws only from that row, so two
// strengths of one product can be counted separately.
export type InventoryRow = { slug: string; size_label: string; quantity: number; threshold: number };

const SHARED = "";

// The row a size draws from: its own if it has one, else the shared row.
// Mirrors RESOLVED_ROW below, which does the same in SQL.
function resolveRow(rows: InventoryRow[], slug: string, sizeLabel: string): InventoryRow | undefined {
  return (
    rows.find((r) => r.slug === slug && r.size_label === sizeLabel) ??
    rows.find((r) => r.slug === slug && r.size_label === SHARED)
  );
}

const RESOLVED_ROW = `slug = $2 AND size_label = CASE
  WHEN EXISTS (SELECT 1 FROM inventory WHERE slug = $2 AND size_label = $3) THEN $3
  ELSE '' END`;

export async function getLowInventoryAlerts(): Promise<LowInventoryAlert[]> {
  const [rows, products] = await Promise.all([
    query<InventoryRow>("SELECT * FROM inventory WHERE quantity <= threshold"),
    listProducts({ includeInactive: true }),
  ]);

  return rows
    .map((row) => {
      const product = products.find((p) => p.slug === row.slug);
      if (!product) return null;
      const name = row.size_label ? `${product.name} ${row.size_label}` : product.name;
      return { slug: row.slug, name, quantity: row.quantity, threshold: row.threshold };
    })
    .filter((alert): alert is LowInventoryAlert => alert !== null)
    .sort((a, b) => a.quantity - b.quantity);
}

export async function getInventoryLevel(
  slug: string
): Promise<{ quantity: number; threshold: number } | undefined> {
  const rows = await query<InventoryRow>("SELECT * FROM inventory WHERE slug = $1 AND size_label = ''", [slug]);
  return rows[0] ? { quantity: rows[0].quantity, threshold: rows[0].threshold } : undefined;
}

export async function listInventory(): Promise<InventoryRow[]> {
  return query<InventoryRow>("SELECT * FROM inventory ORDER BY slug, size_label");
}

// Attaches each product's stock state for the storefront, in one query: one
// state per size, and a combined one for the product as a whole.
export async function withStock<P extends Product>(products: P[]): Promise<P[]> {
  const rows = await listInventory();
  return products.map((p) => {
    const sizeStock: Record<string, StockState> = {};
    const sources = new Set<InventoryRow>();
    const priced = p.sizes.filter((s) => typeof s.priceUsd === "number");
    for (const size of priced.length > 0 ? priced : p.sizes) {
      const row = resolveRow(rows, p.slug, size.label);
      sizeStock[size.label] = stockState(row);
      if (row) sources.add(row);
    }
    return { ...p, sizeStock, stock: combinedStockState([...sources]) };
  });
}

// Creates (or updates) a stock row — the shared one unless a size is given.
// Used when a product is added/edited from the executive Products tab.
// Updating the quantity keeps the row's low-stock threshold unless a new one
// is given; it used to reset it to 10 on every stock edit.
export async function upsertInventory(
  slug: string,
  quantity: number,
  threshold?: number,
  sizeLabel: string = SHARED
): Promise<void> {
  await query(
    `INSERT INTO inventory (slug, size_label, quantity, threshold)
     VALUES ($1, $4, $2, COALESCE($3::int, 10))
     ON CONFLICT (slug, size_label) DO UPDATE SET quantity = EXCLUDED.quantity,
       threshold = COALESCE($3::int, inventory.threshold)`,
    [slug, quantity, threshold ?? null, sizeLabel]
  );
}

// Sets which sizes keep their own count. A size mapped to a number gets its
// own row; a size mapped to null, or no longer on the product, goes back to
// the shared stock (its row is removed).
export async function syncSizeInventory(
  slug: string,
  sizeLabels: string[],
  sizeStock: Record<string, number | null>
): Promise<void> {
  for (const [label, quantity] of Object.entries(sizeStock)) {
    if (quantity !== null && sizeLabels.includes(label)) await upsertInventory(slug, quantity, undefined, label);
  }
  const keep = sizeLabels.filter((label) => typeof sizeStock[label] === "number" || !(label in sizeStock));
  await query("DELETE FROM inventory WHERE slug = $1 AND size_label <> '' AND NOT (size_label = ANY($2::text[]))", [
    slug,
    keep,
  ]);
}

export async function deleteInventory(slug: string): Promise<void> {
  await query("DELETE FROM inventory WHERE slug = $1", [slug]);
}

// Returns the slugs that don't have enough stock to fulfill the given items —
// empty array means the order can be fulfilled. Sizes drawing on the same row
// are counted together.
export async function findInsufficientStock(items: CartItem[]): Promise<string[]> {
  if (items.length === 0) return [];
  const slugs = items.map((i) => i.slug);
  const rows = await query<InventoryRow>("SELECT * FROM inventory WHERE slug = ANY($1)", [slugs]);

  const wanted = new Map<InventoryRow, number>();
  const shortages = new Set<string>();
  for (const item of items) {
    const row = resolveRow(rows, item.slug, item.sizeLabel);
    if (!row) {
      shortages.add(item.slug);
      continue;
    }
    wanted.set(row, (wanted.get(row) ?? 0) + item.quantity);
  }
  for (const [row, quantity] of wanted) {
    if (row.quantity < quantity) shortages.add(row.slug);
  }
  return [...shortages];
}

// Decrements on-hand stock for each item. Never goes below zero.
export async function decrementStock(items: CartItem[]): Promise<void> {
  for (const item of items) {
    await query(`UPDATE inventory SET quantity = GREATEST(0, quantity - $1) WHERE ${RESOLVED_ROW}`, [
      item.quantity,
      item.slug,
      item.sizeLabel,
    ]);
  }
}

// Restores on-hand stock for each item (order cancelled after stock was taken).
export async function restoreStock(items: CartItem[]): Promise<void> {
  for (const item of items) {
    await query(`UPDATE inventory SET quantity = quantity + $1 WHERE ${RESOLVED_ROW}`, [
      item.quantity,
      item.slug,
      item.sizeLabel,
    ]);
  }
}
