// Upload rules for product photos, shared by the uploader in /command and the
// server routes so the two can't drift apart. Client-safe: no server imports.

export const PRODUCT_IMAGE_TYPES = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
} as const;

export type ProductImageType = keyof typeof PRODUCT_IMAGE_TYPES;

export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_EDGE = 1200;

export const PRODUCT_IMAGE_ALLOWED_LABEL = "PNG, JPG or WEBP";

// Where the browser drops the original before the server processes it. The
// server deletes it once the processed copy is stored.
export const incomingImagePrefix = (slug: string) => `products/_incoming/${slug}/`;

export function isProductImageType(type: string): type is ProductImageType {
  return type in PRODUCT_IMAGE_TYPES;
}

// Returns a message to show, or null when the file is acceptable.
export function checkProductImageFile(file: { type: string; size: number; name: string }): string | null {
  if (!isProductImageType(file.type)) {
    return `${file.name || "That file"} isn't an accepted image. Allowed: ${PRODUCT_IMAGE_ALLOWED_LABEL}.`;
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`;
  }
  return null;
}
