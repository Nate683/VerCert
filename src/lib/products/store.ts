import { query } from "@/lib/db";
import type { Product } from "@/lib/types";

// Server-only Postgres-backed product catalog store.

type ProductRow = {
  slug: string;
  name: string;
  category: string;
  cas_number: string;
  molecular_formula: string;
  molecular_weight: string;
  purity_percent: number;
  sequence_or_form: string;
  storage: string;
  sizes: string;
  batch_numbers: string;
  summary: string;
  description: string;
  primary_image_url: string | null;
  gallery_image_urls: string | null;
  sort_order: number;
  active: boolean;
  cost_usd: number | null;
  created_at: string;
  updated_at: string;
};

function rowToProduct(row: ProductRow): Product {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    casNumber: row.cas_number,
    molecularFormula: row.molecular_formula,
    molecularWeight: row.molecular_weight,
    purityPercent: row.purity_percent,
    sequenceOrForm: row.sequence_or_form,
    storage: row.storage,
    sizes: JSON.parse(row.sizes),
    batchNumbers: JSON.parse(row.batch_numbers),
    summary: row.summary,
    description: JSON.parse(row.description),
    primaryImageUrl: row.primary_image_url ?? undefined,
    galleryImageUrls: row.gallery_image_urls ? JSON.parse(row.gallery_image_urls) : undefined,
    sortOrder: row.sort_order,
    active: row.active,
    costUsd: row.cost_usd ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_ALL = "SELECT * FROM products";

// By default only active products are returned (storefront pages). Pass
// includeInactive to also return hidden products (executive admin panel).
export async function listProducts(options?: { includeInactive?: boolean }): Promise<Product[]> {
  const rows = await query<ProductRow>(
    `${SELECT_ALL} ${options?.includeInactive ? "" : "WHERE active = TRUE"} ORDER BY sort_order ASC, name ASC`
  );
  return rows.map(rowToProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const rows = await query<ProductRow>(`${SELECT_ALL} WHERE slug = $1`, [slug]);
  return rows[0] ? rowToProduct(rows[0]) : null;
}

export async function getProductByBatchNumber(batch: string): Promise<Product | null> {
  const rows = await query<ProductRow>(
    `${SELECT_ALL} WHERE batch_numbers::jsonb @> to_jsonb($1::text)`,
    [batch]
  );
  return rows[0] ? rowToProduct(rows[0]) : null;
}

export async function getAllBatchNumbers(): Promise<{ batch: string; product: Product }[]> {
  const products = await listProducts();
  return products.flatMap((p) => p.batchNumbers.map((batch) => ({ batch, product: p })));
}

export type CreateProductInput = {
  slug: string;
  name: string;
  category: string;
  casNumber: string;
  molecularFormula: string;
  molecularWeight: string;
  purityPercent: number;
  sequenceOrForm: string;
  storage: string;
  sizes: Product["sizes"];
  batchNumbers: string[];
  summary: string;
  description: string[];
  sortOrder?: number;
  active?: boolean;
  costUsd?: number;
};

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO products
      (slug, name, category, cas_number, molecular_formula, molecular_weight, purity_percent, sequence_or_form, storage, sizes, batch_numbers, summary, description, sort_order, active, cost_usd, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      input.slug,
      input.name,
      input.category,
      input.casNumber,
      input.molecularFormula,
      input.molecularWeight,
      input.purityPercent,
      input.sequenceOrForm,
      input.storage,
      JSON.stringify(input.sizes),
      JSON.stringify(input.batchNumbers),
      input.summary,
      JSON.stringify(input.description),
      input.sortOrder ?? 0,
      input.active ?? true,
      input.costUsd ?? null,
      now,
      now,
    ]
  );
  const created = await getProductBySlug(input.slug);
  if (!created) throw new Error("Failed to create product.");
  return created;
}

const PATCHABLE_COLUMNS: Record<string, string> = {
  name: "name",
  category: "category",
  casNumber: "cas_number",
  molecularFormula: "molecular_formula",
  molecularWeight: "molecular_weight",
  purityPercent: "purity_percent",
  sequenceOrForm: "sequence_or_form",
  storage: "storage",
  sizes: "sizes",
  batchNumbers: "batch_numbers",
  summary: "summary",
  description: "description",
  primaryImageUrl: "primary_image_url",
  galleryImageUrls: "gallery_image_urls",
  sortOrder: "sort_order",
  active: "active",
  costUsd: "cost_usd",
};

const JSON_FIELDS = new Set(["sizes", "batchNumbers", "description", "galleryImageUrls"]);

export async function updateProduct(
  slug: string,
  patch: Partial<Product>
): Promise<Product | null> {
  const fields = Object.keys(PATCHABLE_COLUMNS).filter((f) => f in patch);

  if (fields.length > 0) {
    const values: unknown[] = [slug];
    const assignments = fields.map((field, i) => {
      const value = (patch as Record<string, unknown>)[field];
      values.push(
        value === undefined ? null : JSON_FIELDS.has(field) ? JSON.stringify(value) : value
      );
      return `${PATCHABLE_COLUMNS[field]} = $${i + 2}`;
    });
    values.push(new Date().toISOString());
    await query(
      `UPDATE products SET ${assignments.join(", ")}, updated_at = $${values.length} WHERE slug = $1`,
      values
    );
  }

  return getProductBySlug(slug);
}

export async function deleteProduct(slug: string): Promise<void> {
  await query("DELETE FROM products WHERE slug = $1", [slug]);
}
