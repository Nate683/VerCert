import { query } from "@/lib/db";
import type { Product } from "@/lib/types";
import { pricedSizes } from "./pricing";

// Server-only Postgres-backed product catalog store.

type ProductRow = {
  slug: string;
  name: string;
  category: string | null;
  alternate_names: string | null;
  cas_number: string | null;
  molecular_formula: string | null;
  molecular_weight: string | null;
  purity_percent: number | null;
  sequence_or_form: string;
  storage: string;
  sizes: string;
  batch_numbers: string;
  summary: string;
  description: string;
  image_url: string | null;
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
    alternateNames: row.alternate_names ? JSON.parse(row.alternate_names) : undefined,
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
    imageUrl: row.image_url ?? undefined,
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

// By default only what the storefront may show: active products with at least
// one priced size. Pass includeInactive for every product (executive panels).
export async function listProducts(options?: { includeInactive?: boolean }): Promise<Product[]> {
  const rows = await query<ProductRow>(
    `${SELECT_ALL} ${options?.includeInactive ? "" : "WHERE active = TRUE"} ORDER BY sort_order ASC, name ASC`
  );
  const products = rows.map(rowToProduct);
  return options?.includeInactive ? products : products.filter(isOnSale);
}

// Whether customers can see and buy this product at all.
export function isOnSale(product: Product): boolean {
  return product.active !== false && pricedSizes(product).length > 0;
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
  category: string | null;
  alternateNames?: string[];
  casNumber: string | null;
  molecularFormula: string | null;
  molecularWeight: string | null;
  purityPercent: number | null;
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
      (slug, name, category, alternate_names, cas_number, molecular_formula, molecular_weight, purity_percent, sequence_or_form, storage, sizes, batch_numbers, summary, description, sort_order, active, cost_usd, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      input.slug,
      input.name,
      input.category,
      input.alternateNames?.length ? JSON.stringify(input.alternateNames) : null,
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
  alternateNames: "alternate_names",
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

const JSON_FIELDS = new Set(["sizes", "batchNumbers", "description", "galleryImageUrls", "alternateNames"]);

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

// Sets or clears the product photo. It replaces the older primary image
// outright, so a product has one main photo. The caller deletes the blobs
// this leaves unreferenced (see lib/products/blob-images.ts).
export async function setProductImage(slug: string, imageUrl: string | null): Promise<Product | null> {
  await query(
    "UPDATE products SET image_url = $2, primary_image_url = NULL, updated_at = $3 WHERE slug = $1",
    [slug, imageUrl, new Date().toISOString()]
  );
  return getProductBySlug(slug);
}

export async function deleteProduct(slug: string): Promise<void> {
  await query("DELETE FROM products WHERE slug = $1", [slug]);
}
