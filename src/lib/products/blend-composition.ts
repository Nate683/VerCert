import { randomUUID } from "crypto";
import { query, transaction } from "@/lib/db";
import { listProducts } from "./store";
import {
  looksLikeBlend,
  validateComposition,
  type BlendComposition,
  type BlendRow,
  type CompositionInput,
  type PublicBlendComposition,
} from "./blend-composition-shared";

// Server-side blend compositions (Website Refinements Package 1). Saving a composition writes ONLY the two blend
// tables: it never touches the blend's or any ingredient's stock, price, SKU or product record (a blend is its own
// independently stocked SKU).

export class BlendError extends Error {
  constructor(message: string, readonly status = 400, readonly errors: string[] = [message]) {
    super(message);
  }
}

type Row = {
  blend_strength_id: string;
  blend_slug: string;
  declared_total_mg: string | number;
  version: number;
  updated_at: string;
  updated_by: string;
  component_slug: string;
  amount_mg: string | number;
  position: number;
  name: string;
  active: boolean;
};

async function readCompositions(strengthIds?: string[]): Promise<Map<string, BlendComposition>> {
  const rows = await query<Row>(
    `SELECT c.blend_strength_id, c.blend_slug, c.declared_total_mg, c.version, c.updated_at, c.updated_by,
            b.component_slug, b.amount_mg, b.position, p.name, p.active
       FROM blend_compositions c
       JOIN blend_components b ON b.blend_strength_id = c.blend_strength_id
       JOIN products p ON p.slug = b.component_slug
      ${strengthIds ? "WHERE c.blend_strength_id = ANY($1)" : ""}
      ORDER BY c.blend_strength_id, b.position`,
    strengthIds ? [strengthIds] : []
  );
  const out = new Map<string, BlendComposition>();
  for (const r of rows) {
    let c = out.get(r.blend_strength_id);
    if (!c) {
      c = { strengthId: r.blend_strength_id, blendSlug: r.blend_slug, declaredTotalMg: Number(r.declared_total_mg), ingredients: [],
        version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by };
      out.set(r.blend_strength_id, c);
    }
    c.ingredients.push({ componentSlug: r.component_slug, name: r.name, amountMg: Number(r.amount_mg), position: r.position, componentActive: r.active !== false });
  }
  return out;
}

// For the customer-facing product page: the structured composition of each of these strengths, if it has one.
export async function getPublicCompositions(strengthIds: string[]): Promise<Record<string, PublicBlendComposition>> {
  if (strengthIds.length === 0) return {};
  const map = await readCompositions(strengthIds);
  const out: Record<string, PublicBlendComposition> = {};
  for (const [id, c] of map) out[id] = { totalMg: c.declaredTotalMg, ingredients: c.ingredients.map((i) => ({ name: i.name, amountMg: i.amountMg })) };
  return out;
}

// Every blend strength, for the Executive Office: with its structured composition, or flagged for completion.
export async function listBlendRows(): Promise<BlendRow[]> {
  const [products, compositions] = await Promise.all([listProducts({ includeInactive: true }), readCompositions()]);
  const composedSlugs = new Set([...compositions.values()].map((c) => c.blendSlug));
  const rows: BlendRow[] = [];
  for (const p of products) {
    const isBlend = looksLikeBlend(p) || composedSlugs.has(p.slug) || p.sizes.some((s) => (s.composition?.length ?? 0) > 0);
    if (!isBlend) continue;
    for (const s of p.sizes) {
      if (!s.id) continue;
      const composition = compositions.get(s.id) ?? null;
      rows.push({
        productSlug: p.slug, productName: p.name, productActive: p.active !== false, strengthId: s.id, sku: s.sku ?? "", label: s.label,
        strengthActive: s.active !== false, composition, legacyComposition: s.composition?.length ? s.composition : null, flagged: !composition,
      });
    }
  }
  return rows.sort((a, b) => a.productName.localeCompare(b.productName) || a.label.localeCompare(b.label));
}

// The compounds an ingredient can reference: every catalog product, hidden ones included (marked), except blends.
export async function listIngredientChoices(): Promise<{ slug: string; name: string; active: boolean }[]> {
  const products = await listProducts({ includeInactive: true });
  return products
    .filter((p) => !looksLikeBlend(p))
    .map((p) => ({ slug: p.slug, name: p.name, active: p.active !== false }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function blendOf(strengthId: string): Promise<{ slug: string; sku: string }> {
  const [s] = await query<{ product_slug: string; sku: string }>("SELECT product_slug, sku FROM product_strengths WHERE id = $1", [strengthId]);
  if (!s) throw new BlendError("That strength doesn't exist.", 404);
  return { slug: s.product_slug, sku: s.sku };
}

function dbError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  if (e.code === "P0004") throw new BlendError((e.message ?? "").replace(/^Blend composition: /, ""));
  if (e.code === "23503") throw new BlendError("An ingredient isn't a product in the catalog.");
  if (e.code === "23505") throw new BlendError("Each compound can appear once in a blend.");
  throw err;
}

// Replaces a strength's composition as one transaction: the declared total, then every ingredient in order.
export async function saveComposition(strengthId: string, input: CompositionInput, actor: string): Promise<BlendComposition> {
  const blend = await blendOf(strengthId);
  const products = await listProducts({ includeInactive: true });
  const productNames = new Map(products.map((p) => [p.slug, p.name]));
  const errors = validateComposition(input, { blendSlug: blend.slug, productNames });
  if (errors.length) throw new BlendError(errors[0], 400, errors);
  const now = new Date().toISOString();
  try {
    await transaction([
      {
        text: `INSERT INTO blend_compositions (blend_strength_id, blend_slug, declared_total_mg, created_at, created_by, updated_at, updated_by)
               VALUES ($1, $2, $3, $4, $5, $4, $5)
               ON CONFLICT (blend_strength_id) DO UPDATE SET declared_total_mg = EXCLUDED.declared_total_mg,
                 version = blend_compositions.version + 1, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
        params: [strengthId, blend.slug, input.declaredTotalMg, now, actor],
      },
      { text: "DELETE FROM blend_components WHERE blend_strength_id = $1", params: [strengthId] },
      ...input.ingredients.map((ing, i) => ({
        text: "INSERT INTO blend_components (id, blend_strength_id, component_slug, amount_mg, position) VALUES ($1, $2, $3, $4, $5)",
        params: [randomUUID(), strengthId, ing.componentSlug, ing.amountMg, i],
      })),
    ]);
  } catch (err) {
    dbError(err);
  }
  const saved = (await readCompositions([strengthId])).get(strengthId);
  if (!saved) throw new BlendError("The composition couldn't be read back after saving.", 500);
  return saved;
}

// Removes a strength's composition entirely (the blend is then flagged for completion again). Stock is untouched.
export async function clearComposition(strengthId: string): Promise<boolean> {
  await blendOf(strengthId);
  const rows = await query<{ blend_strength_id: string }>("DELETE FROM blend_compositions WHERE blend_strength_id = $1 RETURNING blend_strength_id", [strengthId]);
  return rows.length > 0;
}
