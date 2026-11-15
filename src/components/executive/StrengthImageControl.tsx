"use client";

import { useRef, useState } from "react";
import type { Product, SizeOption } from "@/lib/types";
import { ProductImage } from "@/components/ProductImage";
import { productImageSources } from "@/lib/products/images";
import { strengthImageSources } from "@/lib/products/strengths";
import { uploadProductOriginal } from "@/lib/products/upload-client";
import { checkProductImageFile, PRODUCT_IMAGE_ALLOWED_LABEL, PRODUCT_IMAGE_TYPES } from "@/lib/products/image-rules";

const ACCEPT = Object.keys(PRODUCT_IMAGE_TYPES).join(",");

// One strength's primary vial image (Stage 1), in its Sizes & Pricing panel. Same pipeline and rules as the product
// photo (ProductCardImage): browser → this product's incoming Blob folder → the server processes and stores it
// (/api/executive/products/[slug]/strengths/[id]/image). It saves on its own, at once, like the product photo — not
// through Save Product. The preview shows exactly what the product page will: this image, else the product photo,
// else the placeholder. The product photo and the gallery are never changed here.
export function StrengthImageControl({
  product,
  strength,
  onChange,
}: {
  product: Product;
  strength: SizeOption;
  onChange: (updated: Product) => void;
}) {
  const [busy, setBusy] = useState<null | "uploading" | "processing" | "removing">(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sources = strengthImageSources(strength, productImageSources(product));
  const own = Boolean(strength.imageUrl);
  const endpoint = `/api/executive/products/${product.slug}/strengths/${strength.id}/image`;

  async function start(file: File | undefined) {
    if (!file || busy) return;
    const problem = checkProductImageFile(file);
    if (problem) return setError(problem);
    setError(null);
    setBusy("uploading");
    try {
      const uploadUrl = await uploadProductOriginal(product.slug, file);
      setBusy("processing");
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.product) throw new Error(data.error ?? `The image couldn't be saved (${res.status}).`);
      onChange(data.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image couldn't be saved.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy("removing");
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.product) throw new Error(data.error ?? `The image couldn't be removed (${res.status}).`);
      onChange(data.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image couldn't be removed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-start gap-4" data-strength-image-control={strength.id}>
      <div className="w-28 shrink-0 border border-white/10">
        <ProductImage key={sources.join("|")} sources={sources} name={`${product.name} ${strength.label}`} alt={`${product.name}, ${strength.label}`} sizes="112px" />
      </div>
      <div className="space-y-2 text-[11px] text-white/50">
        <p>
          {own
            ? "This strength's own vial image."
            : "No image of its own: the product page shows the product photo for this strength."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => inputRef.current?.click()}
            className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)] disabled:opacity-40"
          >
            {own ? "Replace image" : "Upload vial image"}
          </button>
          {own && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={remove}
              className="border border-red-400/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300 hover:bg-red-500/20 disabled:opacity-40"
            >
              Remove image
            </button>
          )}
        </div>
        <p>A {PRODUCT_IMAGE_ALLOWED_LABEL}. Saves immediately.</p>
        {busy && (
          <p role="status" aria-live="polite" className="text-white/70">
            {busy === "uploading" ? "Uploading…" : busy === "processing" ? "Processing…" : "Removing…"}
          </p>
        )}
        {error && <p className="text-red-300">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => start(e.target.files?.[0])}
          aria-label={`Upload a vial image for ${product.name} ${strength.label}`}
        />
      </div>
    </div>
  );
}
