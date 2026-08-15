import { query } from "@/lib/db";
import { listProducts } from "@/lib/products";
import type { CartItem } from "@/lib/types";

export type LowInventoryAlert = {
  slug: string;
  name: string;
  quantity: number;
  threshold: number;
};

type InventoryRow = { slug: string; quantity: number; threshold: number };

export async function getLowInventoryAlerts(): Promise<LowInventoryAlert[]> {
  const [rows, products] = await Promise.all([
    query<InventoryRow>("SELECT * FROM inventory WHERE quantity <= threshold"),
    listProducts({ includeInactive: true }),
  ]);

  return rows
    .map((row) => {
      const product = products.find((p) => p.slug === row.slug);
      if (!product) return null;
      return { slug: row.slug, name: product.name, quantity: row.quantity, threshold: row.threshold };
    })
    .filter((alert): alert is LowInventoryAlert => alert !== null)
    .sort((a, b) => a.quantity - b.quantity);
}

export async function getInventoryLevel(
  slug: string
): Promise<{ quantity: number; threshold: number } | undefined> {
  const rows = await query<InventoryRow>("SELECT * FROM inventory WHERE slug = $1", [slug]);
  return rows[0] ? { quantity: rows[0].quantity, threshold: rows[0].threshold } : undefined;
}

export async function listInventory(): Promise<InventoryRow[]> {
  return query<InventoryRow>("SELECT * FROM inventory ORDER BY slug");
}

// Creates (or updates) the stock row for a product — used when a product is
// added/edited from the executive Products tab.
export async function upsertInventory(
  slug: string,
  quantity: number,
  threshold = 10
): Promise<void> {
  await query(
    `INSERT INTO inventory (slug, quantity, threshold)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET quantity = EXCLUDED.quantity, threshold = EXCLUDED.threshold`,
    [slug, quantity, threshold]
  );
}

export async function deleteInventory(slug: string): Promise<void> {
  await query("DELETE FROM inventory WHERE slug = $1", [slug]);
}

// Returns the slugs that don't have enough stock to fulfill the given items —
// empty array means the order can be fulfilled.
export async function findInsufficientStock(items: CartItem[]): Promise<string[]> {
  if (items.length === 0) return [];
  const slugs = items.map((i) => i.slug);
  const rows = await query<InventoryRow>("SELECT * FROM inventory WHERE slug = ANY($1)", [slugs]);
  const levels = new Map(rows.map((r) => [r.slug, r.quantity]));

  const shortages: string[] = [];
  for (const item of items) {
    const quantity = levels.get(item.slug);
    if (quantity === undefined || quantity < item.quantity) shortages.push(item.slug);
  }
  return shortages;
}

// Decrements on-hand stock for each item. Never goes below zero.
export async function decrementStock(items: CartItem[]): Promise<void> {
  for (const item of items) {
    await query("UPDATE inventory SET quantity = GREATEST(0, quantity - $1) WHERE slug = $2", [
      item.quantity,
      item.slug,
    ]);
  }
}

// Restores on-hand stock for each item (order cancelled after stock was taken).
export async function restoreStock(items: CartItem[]): Promise<void> {
  for (const item of items) {
    await query("UPDATE inventory SET quantity = quantity + $1 WHERE slug = $2", [
      item.quantity,
      item.slug,
    ]);
  }
}

