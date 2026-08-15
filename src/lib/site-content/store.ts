import { query } from "@/lib/db";

// Generic key/value store for editable site copy — one JSON blob per key.
// Callers pass a typed fallback (see defaults.ts) so the storefront renders
// sensible copy even before an admin has ever saved anything for that key.

export async function getContent<T>(key: string, fallback: T): Promise<T> {
  const rows = await query<{ value: string }>("SELECT value FROM site_content WHERE key = $1", [
    key,
  ]);
  if (!rows[0]) return fallback;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return fallback;
  }
}

export async function setContent(key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO site_content (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, JSON.stringify(value), now]
  );
}

const CONTENT_KEYS = [
  "home_hero",
  "featured_products",
  "about_page",
  "faq_items",
  "contact_page",
  "policies",
  "sale_banner",
] as const;

export type ContentKey = (typeof CONTENT_KEYS)[number];

// Returns every known key's raw stored value (or null if never saved) —
// used by the admin Content tab to fetch everything in one request.
export async function getAllContentRaw(): Promise<Record<ContentKey, unknown | null>> {
  const rows = await query<{ key: string; value: string }>(
    "SELECT key, value FROM site_content WHERE key = ANY($1)",
    [CONTENT_KEYS as unknown as string[]]
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const result = {} as Record<ContentKey, unknown | null>;
  for (const key of CONTENT_KEYS) {
    const raw = byKey.get(key);
    try {
      result[key] = raw ? JSON.parse(raw) : null;
    } catch {
      result[key] = null;
    }
  }
  return result;
}
