import { put } from "@vercel/blob";
import { InvalidProductImageError, processProductImage } from "./image-processing";
import { deleteBlobs, isIncomingUpload, sweepAbandonedUploads } from "./blob-images";
import { PRODUCT_IMAGE_MAX_BYTES } from "./image-rules";

export class ImageIngestError extends Error {}

export type IngestedImage = { url: string; width: number; height: number; bytes: number };

// Turns an original the browser uploaded to products/_incoming/<slug>/ into a
// stored product image: reads it back, processes it (image-processing.ts) and
// stores the processed copy. The original is always deleted afterwards. The
// caller records the URL and, if that fails, deletes the new blob.
//
// Shared by the main photo (../image) and the gallery (../gallery) routes so
// every product image goes through the same checks and processing.
export async function ingestProductImage(slug: string, uploadUrl: unknown): Promise<IngestedImage> {
  // Only ever fetch from this product's incoming folder in our own store.
  if (typeof uploadUrl !== "string" || !isIncomingUpload(uploadUrl, slug)) {
    throw new ImageIngestError("That upload isn't one this product can use.");
  }
  try {
    const res = await fetch(uploadUrl, { cache: "no-store" });
    if (!res.ok) throw new ImageIngestError("The uploaded file couldn't be read back.");
    const original = Buffer.from(await res.arrayBuffer());
    if (original.length > PRODUCT_IMAGE_MAX_BYTES) throw new ImageIngestError("Image must be 10 MB or smaller.");

    const processed = await processProductImage(original);
    const stored = await put(`products/${slug}/${slug}.${processed.extension}`, processed.data, {
      access: "public",
      contentType: processed.contentType,
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return { url: stored.url, width: processed.width, height: processed.height, bytes: processed.data.length };
  } catch (err) {
    if (err instanceof InvalidProductImageError) throw new ImageIngestError(err.message);
    throw err;
  } finally {
    await deleteBlobs([uploadUrl]);
    await sweepAbandonedUploads();
  }
}
