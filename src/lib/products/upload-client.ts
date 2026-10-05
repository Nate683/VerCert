"use client";

import { upload } from "@vercel/blob/client";
import { incomingImagePrefix } from "./image-rules";

// Sends an original straight from the browser to the product's incoming Blob
// folder (a 10 MB file can't pass through a Vercel function) and returns its
// URL for the server to process. The token comes from ../image/upload.
export async function uploadProductOriginal(
  slug: string,
  file: File,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {}
): Promise<string> {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80);
  const blob = await upload(`${incomingImagePrefix(slug)}${safeName}`, file, {
    access: "public",
    handleUploadUrl: `/api/executive/products/${slug}/image/upload`,
    contentType: file.type,
    abortSignal: signal,
    onUploadProgress: ({ loaded, total }) => onProgress?.(loaded, total || file.size),
  });
  return blob.url;
}
