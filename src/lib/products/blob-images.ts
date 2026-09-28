import { del, list } from "@vercel/blob";
import { incomingImagePrefix } from "./image-rules";

// Host of this project's Blob store, from the read-write token
// (vercel_blob_rw_<storeId>_<secret>). URLs anywhere else are never fetched
// or deleted by the product image routes.
function storeHost(): string | null {
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([^_]+)_/)?.[1];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

export function isOwnBlobUrl(value: string | undefined | null, pathPrefix = ""): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === storeHost() && url.pathname.startsWith(`/${pathPrefix}`);
  } catch {
    return false;
  }
}

export const isIncomingUpload = (value: string | undefined | null, slug: string): value is string =>
  isOwnBlobUrl(value, incomingImagePrefix(slug));

// Best effort: a blob that fails to delete is only an orphan, never worth
// failing the request that replaced it.
export async function deleteBlobs(urls: (string | undefined | null)[]): Promise<void> {
  const own = urls.filter((u): u is string => isOwnBlobUrl(u));
  if (own.length === 0) return;
  await del(own).catch((err) => console.error("[product-image] couldn't delete old blob(s):", own, err));
}

// Originals left behind when an upload was abandoned before processing.
export async function sweepAbandonedUploads(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const { blobs } = await list({ prefix: "products/_incoming/", limit: 1000 });
    const cutoff = Date.now() - olderThanMs;
    await deleteBlobs(blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff).map((b) => b.url));
  } catch (err) {
    console.error("[product-image] sweep of abandoned uploads failed:", err);
  }
}
