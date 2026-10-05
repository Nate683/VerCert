"use client";

import { useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { ProductImage } from "@/components/ProductImage";
import { productImageAlt } from "@/lib/products/images";
import { uploadProductOriginal } from "@/lib/products/upload-client";
import {
  checkProductImageFile,
  PRODUCT_GALLERY_MAX,
  PRODUCT_IMAGE_ALLOWED_LABEL,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/products/image-rules";

const ACCEPT = Object.keys(PRODUCT_IMAGE_TYPES).join(",");

type Progress = { done: number; count: number; pct: number; stage: "uploading" | "processing" };

// The extra photos shown after the main one on the product page, edited from
// the product's Edit form. Each file goes browser → Blob, then the server
// processes it exactly like the main photo and appends it. Several files can
// be chosen or dropped at once; they upload one after another, in order.
export function ProductGalleryEditor({
  product,
  onChange,
}: {
  product: Product;
  onChange: (updated: Product) => void;
}) {
  const gallery = product.galleryImageUrls ?? [];
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { slug } = product;
  const room = PRODUCT_GALLERY_MAX - gallery.length;
  const busy = progress !== null || busyUrl !== null;

  async function send(method: "PUT" | "PATCH" | "DELETE", body?: unknown, url?: string) {
    const target = `/api/executive/products/${slug}/gallery${url ? `?url=${encodeURIComponent(url)}` : ""}`;
    const res = await fetch(target, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.product) throw new Error(data.error ?? `The gallery couldn't be saved (${res.status}).`);
    onChange(data.product);
  }

  async function add(files: File[]) {
    if (busy || files.length === 0) return;
    setError(null);
    const accepted = files.slice(0, Math.max(0, room));
    const problems = accepted.map(checkProductImageFile).filter(Boolean);
    if (files.length > accepted.length) problems.push(`Only ${room} more photo${room === 1 ? "" : "s"} fit (limit ${PRODUCT_GALLERY_MAX}).`);
    const ok = accepted.filter((f) => !checkProductImageFile(f));
    try {
      for (const [i, file] of ok.entries()) {
        setProgress({ done: i, count: ok.length, pct: 0, stage: "uploading" });
        const uploadUrl = await uploadProductOriginal(slug, file, {
          onProgress: (loaded, total) =>
            setProgress({ done: i, count: ok.length, pct: total ? Math.round((loaded / total) * 100) : 0, stage: "uploading" }),
        });
        setProgress({ done: i, count: ok.length, pct: 100, stage: "processing" });
        await send("PUT", { uploadUrl });
      }
    } catch (err) {
      problems.push(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
      setError(problems.length ? problems.join(" ") : null);
    }
  }

  async function act(url: string, fn: () => Promise<void>) {
    setBusyUrl(url);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The gallery couldn't be saved.");
    } finally {
      setBusyUrl(null);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const order = [...gallery];
    const target = index + direction;
    [order[index], order[target]] = [order[target], order[index]];
    act(gallery[index], () => send("PATCH", { order }));
  }

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-white/40">
        Gallery — {gallery.length}/{PRODUCT_GALLERY_MAX}, shown after the main photo, in this order
      </p>
      <div className="flex flex-wrap gap-2" data-gallery-editor={slug}>
        {gallery.map((url, i) => (
          <div key={url} className={`relative h-24 w-24 ${busyUrl === url ? "opacity-40" : ""}`}>
            <ProductImage sources={[url]} name={product.name} alt={productImageAlt(product)} />
            <button
              type="button"
              disabled={busy}
              onClick={() => act(url, () => send("DELETE", undefined, url))}
              aria-label={`Remove gallery photo ${i + 1}`}
              className="absolute -right-1 -top-1 h-6 w-6 border border-red-500/40 bg-black text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-30"
            >
              ×
            </button>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/80">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={busy || i === 0}
                aria-label={`Move photo ${i + 1} earlier`}
                className="px-2 py-1 text-xs text-white/70 hover:text-gold disabled:opacity-20"
              >
                ←
              </button>
              <span className="font-mono text-[10px] text-white/50">{i + 2}</span>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={busy || i === gallery.length - 1}
                aria-label={`Move photo ${i + 1} later`}
                className="px-2 py-1 text-xs text-white/70 hover:text-gold disabled:opacity-20"
              >
                →
              </button>
            </div>
          </div>
        ))}

        {room > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              add(Array.from(e.dataTransfer.files ?? []));
            }}
            className={`flex h-24 w-24 flex-col items-center justify-center gap-1 border border-dashed px-1 text-center text-[10px] uppercase tracking-[0.1em] transition-colors hover:border-gold hover:text-gold disabled:cursor-wait ${
              dragging ? "border-gold text-gold" : "border-white/20 text-white/40"
            }`}
          >
            {progress ? (
              <>
                <span>
                  {progress.stage === "processing" ? "Processing" : `${progress.pct}%`}
                </span>
                {progress.count > 1 && (
                  <span className="text-white/40">
                    {progress.done + 1} of {progress.count}
                  </span>
                )}
              </>
            ) : (
              <>
                <span>+ Add photos</span>
                <span className="normal-case tracking-normal text-white/30">or drop here</span>
              </>
            )}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="mt-2 text-[10px] text-white/30">
        {PRODUCT_IMAGE_ALLOWED_LABEL}, up to 10 MB each. Photos are resized and compressed on upload.
      </p>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
