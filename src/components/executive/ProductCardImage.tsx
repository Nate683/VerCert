"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Product } from "@/lib/types";
import { ProductImage } from "@/components/ProductImage";
import { productImageAlt, productImageSources } from "@/lib/products/images";
import { uploadProductOriginal } from "@/lib/products/upload-client";
import {
  checkProductImageFile,
  PRODUCT_IMAGE_ALLOWED_LABEL,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/products/image-rules";

type Stage =
  | { kind: "idle" }
  | { kind: "uploading"; previewUrl: string; loaded: number; total: number }
  | { kind: "processing"; previewUrl: string }
  | { kind: "confirm-remove" }
  | { kind: "removing" };

const ACCEPT = Object.keys(PRODUCT_IMAGE_TYPES).join(",");

// The image area of a product card in the /command catalog, and the product's
// photo control. Click it (or drop a file on it) and the file uploads at once:
// browser → Blob with real progress, then the server resizes, compresses and
// stores the processed copy, sets image_url and deletes the original and the
// photo it replaced. The card updates in place through onChange.
export function ProductCardImage({
  product,
  onChange,
  children,
}: {
  product: Product;
  onChange: (updated: Product) => void;
  children?: ReactNode; // badges laid over the image
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const previewUrl = "previewUrl" in stage ? stage.previewUrl : null;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const sources = productImageSources(product);
  const hasImage = sources.length > 0;
  const busy = stage.kind === "uploading" || stage.kind === "processing" || stage.kind === "removing";
  const { slug, name } = product;

  function choose() {
    if (!busy) inputRef.current?.click();
  }

  async function start(file: File | undefined) {
    if (!file || busy) return;
    const problem = checkProductImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const preview = URL.createObjectURL(file);
    const controller = new AbortController();
    abortRef.current = controller;
    setStage({ kind: "uploading", previewUrl: preview, loaded: 0, total: file.size });
    try {
      const uploadUrl = await uploadProductOriginal(slug, file, {
        signal: controller.signal,
        onProgress: (loaded, total) =>
          setStage((s) => (s.kind === "uploading" ? { ...s, loaded, total: total || s.total } : s)),
      });

      setStage({ kind: "processing", previewUrl: preview });
      const res = await fetch(`/api/executive/products/${slug}/image`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.product) throw new Error(data.error ?? `The photo couldn't be saved (${res.status}).`);
      onChange(data.product);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error("[product-image] upload failed:", err);
        setError(err instanceof Error ? err.message : "The photo couldn't be saved.");
      }
    } finally {
      abortRef.current = null;
      setStage({ kind: "idle" });
    }
  }

  async function remove() {
    setStage({ kind: "removing" });
    setError(null);
    try {
      const res = await fetch(`/api/executive/products/${slug}/image`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.product) throw new Error(data.error ?? `The photo couldn't be removed (${res.status}).`);
      onChange(data.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo couldn't be removed.");
    } finally {
      setStage({ kind: "idle" });
    }
  }

  const pct = stage.kind === "uploading" && stage.total ? Math.round((stage.loaded / stage.total) * 100) : 0;
  const barButton =
    "pointer-events-auto border bg-black/80 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-colors";

  return (
    <div>
      <div
        className="group/photo relative"
        data-photo-dropzone={slug}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = busy ? "none" : "copy";
          if (!busy) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          start(e.dataTransfer.files?.[0]);
        }}
      >
        <button
          type="button"
          onClick={choose}
          disabled={busy}
          aria-label={hasImage ? `Replace photo of ${name}` : `Upload a photo of ${name}`}
          title={hasImage ? "Click to replace the photo, or drop a file here" : "Click to upload a photo, or drop a file here"}
          className="block w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold disabled:cursor-progress"
        >
          {/* Keyed on the URL so a new photo starts a fresh load. */}
          <ProductImage key={sources.join("|")} sources={sources} name={name} alt={productImageAlt(product)} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
        </button>

        {children}

        {/* The photo being uploaded, framed like the tile, until the saved one arrives. */}
        {previewUrl && (
          // A plain <img>: a local object URL can't go through next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full border border-navy bg-navy object-cover"
          />
        )}

        {stage.kind === "idle" && !hasImage && !dragging && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="border border-gold bg-black/85 px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-gold transition-colors group-hover/photo:bg-gold group-hover/photo:text-black">
              + Add photo
            </span>
            <span className="bg-black/70 px-2 py-0.5 text-[10px] text-white/60">Click or drop a {PRODUCT_IMAGE_ALLOWED_LABEL}</span>
          </div>
        )}

        {stage.kind === "idle" && hasImage && !dragging && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-3 pt-8 opacity-0 transition-opacity group-hover/photo:opacity-100 group-focus-within/photo:opacity-100 [@media(hover:none)]:opacity-100">
            <button
              type="button"
              onClick={choose}
              className={`${barButton} border-gold text-gold hover:bg-gold hover:text-black`}
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStage({ kind: "confirm-remove" });
              }}
              className={`${barButton} border-red-400/60 text-red-300 hover:bg-red-500/30`}
            >
              Remove
            </button>
          </div>
        )}

        {stage.kind === "confirm-remove" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center">
            <p className="text-xs text-white/80">Remove this photo? The shop shows the placeholder instead.</p>
            <div className="flex gap-2">
              <button type="button" onClick={remove} className={`${barButton} border-red-400/70 text-red-300 hover:bg-red-500/30`}>
                Remove
              </button>
              <button
                type="button"
                onClick={() => setStage({ kind: "idle" })}
                className={`${barButton} border-white/30 text-white/70 hover:text-white`}
              >
                Keep
              </button>
            </div>
          </div>
        )}

        {(stage.kind === "uploading" || stage.kind === "processing" || stage.kind === "removing") && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-black/45 p-4"
          >
            {stage.kind !== "removing" && (
              <div
                className="h-1.5 w-full overflow-hidden bg-white/20"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stage.kind === "uploading" ? pct : undefined}
                aria-label="Upload progress"
              >
                {stage.kind === "uploading" ? (
                  <div
                    className="upload-progress-fill h-full bg-gold transition-[width] duration-200"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                ) : (
                  <div className="h-full w-full animate-pulse bg-gold" />
                )}
              </div>
            )}
            <div className="flex w-full items-center justify-between gap-2">
              <span className="bg-black/80 px-2 py-1 font-mono text-[11px] text-white">
                {stage.kind === "uploading"
                  ? `Uploading ${pct}%`
                  : stage.kind === "processing"
                    ? "Processing…"
                    : "Removing…"}
              </span>
              {stage.kind === "uploading" && (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className={`${barButton} border-white/30 text-white/70 hover:text-white`}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 ring-2 ring-inset ring-gold">
            <span className="text-xs uppercase tracking-[0.15em] text-gold">Drop to upload</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-photo-input={slug}
          onChange={(e) => {
            start(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-2 border-b border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="text-red-300/70 hover:text-red-200">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
