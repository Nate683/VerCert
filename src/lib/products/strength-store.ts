import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { SizeOption } from "@/lib/types";
import { AVAILABILITY_STATUSES, DEFAULT_AVAILABILITY_STATUS, type AvailabilityStatus } from "./availability";
import { toDateOnly } from "./estimated-availability";
import { skuOf } from "./strengths";

// Server-only. Strength-specific SKUs (Stage 1): one product_strengths row per strength of a product
// (scripts/product-strengths.mjs created the table and one row per existing size).
//
// - The row is the source of truth for the strength: label, SKU code, price, cost, bulk tiers, blend composition,
//   availability status, estimated date, vial image, active flag, display position.
// - id is permanent: made once, never regenerated or reused. A rename, a price/image/status change and
//   deactivation all keep it. Strengths are never deleted here; deactivate one instead (active = false).
// - sku is made once, from the label at creation (skuOf), and kept after — a rename doesn't change it.
// - products.sizes (the JSON the code read before Stage 1) is still written on every save, as a mirror of the
//   ACTIVE strengths in its old shape, so the pre-Stage-1 code would still work if it were redeployed. It is no
//   longer read while strengths exist for the product.

type StrengthRow = {
  id: string;
  product_slug: string;
  label: string;
  sku: string;
  position: number;
  active: boolean;
  availability_status: AvailabilityStatus;
  estimated_available_on: Date | string | null;
  image_url: string | null;
  price_usd: number | null;
  cost_usd: number | null;
  bulk_tiers: SizeOption["bulkTiers"] | string | null;
  composition: SizeOption["composition"] | string | null;
};

const json = <T,>(v: T | string | null): T | null => (typeof v === "string" ? (JSON.parse(v) as T) : v);

function rowToSize(r: StrengthRow): SizeOption {
  const bulkTiers = json(r.bulk_tiers);
  const composition = json(r.composition);
  return {
    id: r.id,
    sku: r.sku,
    label: r.label,
    priceUsd: r.price_usd === null ? null : Number(r.price_usd),
    ...(bulkTiers?.length ? { bulkTiers } : {}),
    ...(r.cost_usd !== null ? { costUsd: Number(r.cost_usd) } : {}),
    ...(composition?.length ? { composition } : {}),
    active: r.active,
    availabilityStatus: AVAILABILITY_STATUSES.includes(r.availability_status) ? r.availability_status : DEFAULT_AVAILABILITY_STATUS,
    estimatedAvailableOn: toDateOnly(r.estimated_available_on),
    imageUrl: r.image_url,
  };
}

// Every strength (active and deactivated), grouped by product, in display order.
export async function listStrengths(slug?: string): Promise<Map<string, SizeOption[]>> {
  const rows = await query<StrengthRow>(
    `SELECT * FROM product_strengths ${slug ? "WHERE product_slug = $1" : ""} ORDER BY product_slug, position, created_at`,
    slug ? [slug] : []
  );
  const out = new Map<string, SizeOption[]>();
  for (const r of rows) out.set(r.product_slug, [...(out.get(r.product_slug) ?? []), rowToSize(r)]);
  return out;
}

export class StrengthError extends Error {}

const compact = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export type StrengthPlan = {
  statements: { text: string; params: unknown[] }[];
  sizes: SizeOption[]; // the strengths as they will be after the save, in order
  renames: { id: string; from: string; to: string }[];
};

// Plans a save of a product's strengths from the submitted list. Nothing is written; the caller runs `statements`
// in one transaction with its own. Each submitted size is matched to an existing strength by id, else by label (a
// client from before Stage 1 sends no ids); anything unmatched is a new strength. Throws StrengthError for:
//   - a duplicate label (also "10mg" vs "10 mg", which the shareable URL couldn't tell apart);
//   - an id that isn't one of this product's strengths;
//   - an existing strength missing from the list — strengths are deactivated, never deleted (unless
//     `deactivateMissing`, used when a product is re-created over strengths kept from a deleted one: they are kept,
//     deactivated).
// Fields absent from a submitted size keep their stored values (a client that doesn't know about status, date or
// active leaves them as they are); a new strength starts active, with `defaultStatus` and no date or image.
export async function planStrengthSave(
  slug: string,
  submitted: SizeOption[],
  { defaultStatus = DEFAULT_AVAILABILITY_STATUS, deactivateMissing = false }: { defaultStatus?: AvailabilityStatus; deactivateMissing?: boolean } = {}
): Promise<StrengthPlan> {
  const existing = (await listStrengths(slug)).get(slug) ?? [];
  const seen = new Map<string, string>();
  for (const s of submitted) {
    const label = s.label.trim();
    if (!label) throw new StrengthError("Every strength needs a strength designation (e.g. 10mg).");
    const key = compact(label);
    if (seen.has(key)) throw new StrengthError(`Two strengths are both "${label}". Each strength must be different.`);
    seen.set(key, label);
  }

  const now = new Date().toISOString();
  const matched = new Set<string>();
  const statements: StrengthPlan["statements"] = [];
  const sizes: SizeOption[] = [];
  const renames: StrengthPlan["renames"] = [];
  const takenSkus = new Set(
    (await query<{ sku: string }>("SELECT sku FROM product_strengths")).map((r) => r.sku)
  );

  submitted.forEach((s, position) => {
    const label = s.label.trim();
    let current: SizeOption | undefined;
    if (s.id) {
      current = existing.find((e) => e.id === s.id);
      if (!current) throw new StrengthError(`Strength "${label}" isn't one of this product's strengths. Reload and try again.`);
    } else {
      current = existing.find((e) => !matched.has(e.id!) && e.label === label);
    }
    if (current) {
      if (matched.has(current.id!)) throw new StrengthError(`Strength "${label}" was submitted twice.`);
      matched.add(current.id!);
    }
    const next: SizeOption = {
      id: current?.id ?? randomUUID(),
      sku: current?.sku,
      label,
      priceUsd: s.priceUsd,
      ...(s.bulkTiers?.length ? { bulkTiers: s.bulkTiers } : {}),
      ...(s.costUsd !== undefined ? { costUsd: s.costUsd } : {}),
      ...(s.composition?.length ? { composition: s.composition } : {}),
      active: s.active ?? current?.active ?? true,
      availabilityStatus: s.availabilityStatus ?? current?.availabilityStatus ?? defaultStatus,
      estimatedAvailableOn: s.estimatedAvailableOn !== undefined ? s.estimatedAvailableOn : current?.estimatedAvailableOn ?? null,
      imageUrl: current?.imageUrl ?? null,
    };
    const values = [
      next.label, position, next.active, next.availabilityStatus, next.estimatedAvailableOn ?? null,
      next.priceUsd, next.costUsd ?? null, next.bulkTiers ? JSON.stringify(next.bulkTiers) : null,
      next.composition ? JSON.stringify(next.composition) : null, now,
    ];
    if (current) {
      if (current.label !== label) renames.push({ id: current.id!, from: current.label, to: label });
      statements.push({
        text: `UPDATE product_strengths SET label = $2, position = $3, active = $4, availability_status = $5,
                 estimated_available_on = $6::date, price_usd = $7, cost_usd = $8, bulk_tiers = $9::jsonb,
                 composition = $10::jsonb, updated_at = $11
               WHERE id = $1 AND product_slug = $12`,
        params: [next.id, ...values, slug],
      });
    } else {
      // A new SKU code from the convention, made unique if a code is already taken (never reusing one).
      const base = skuOf(slug, label);
      let sku = base;
      for (let n = 2; takenSkus.has(sku); n++) sku = `${base}-${n}`;
      takenSkus.add(sku);
      next.sku = sku;
      statements.push({
        text: `INSERT INTO product_strengths (id, product_slug, sku, label, position, active, availability_status,
                 estimated_available_on, price_usd, cost_usd, bulk_tiers, composition, created_at, updated_at, image_url)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11::jsonb, $12::jsonb, $13, $13, NULL)`,
        params: [next.id, slug, sku, ...values],
      });
    }
    sizes.push(next);
  });

  const missing = existing.filter((e) => !matched.has(e.id!));
  if (missing.length && !deactivateMissing) {
    throw new StrengthError(
      `Strengths are never deleted, so their history stays intact: deactivate ${missing.map((m) => m.label).join(", ")} instead.`
    );
  }
  missing.forEach((m, i) => {
    statements.push({
      text: "UPDATE product_strengths SET active = FALSE, position = $2, updated_at = $3 WHERE id = $1",
      params: [m.id, submitted.length + i, now],
    });
    sizes.push({ ...m, active: false });
  });

  // A rename keeps the strength's own stock count: move its inventory row to the new label (before this, a rename
  // dropped the count). Orders, subscriptions and certificate records are not rewritten — they keep the label they
  // were made with.
  for (const r of renames) {
    statements.push({
      text: `UPDATE inventory SET size_label = $3 WHERE slug = $1 AND size_label = $2
               AND NOT EXISTS (SELECT 1 FROM inventory WHERE slug = $1 AND size_label = $3)`,
      params: [slug, r.from, r.to],
    });
  }
  return { statements, sizes, renames };
}

// The products.sizes mirror: the active strengths, in the shape the code before Stage 1 read.
export function mirrorJson(sizes: SizeOption[]): string {
  return JSON.stringify(
    sizes
      .filter((s) => s.active !== false)
      .map((s) => ({
        label: s.label,
        priceUsd: s.priceUsd,
        ...(s.bulkTiers?.length ? { bulkTiers: s.bulkTiers } : {}),
        ...(s.costUsd !== undefined ? { costUsd: s.costUsd } : {}),
        ...(s.composition?.length ? { composition: s.composition } : {}),
      }))
  );
}

// Sets or clears one strength's vial image. Returns the URL it replaced (the caller deletes that blob), or
// undefined if the strength isn't this product's.
export async function setStrengthImage(slug: string, id: string, imageUrl: string | null): Promise<{ previous: string | null } | undefined> {
  const rows = await query<{ image_url: string | null }>(
    "SELECT image_url FROM product_strengths WHERE id = $1 AND product_slug = $2",
    [id, slug]
  );
  if (!rows[0]) return undefined;
  await query("UPDATE product_strengths SET image_url = $3, updated_at = $4 WHERE id = $1 AND product_slug = $2", [
    id, slug, imageUrl, new Date().toISOString(),
  ]);
  return { previous: rows[0].image_url };
}
