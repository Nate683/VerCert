"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BulkPriceTier, CoaDocument, Product, SizeOption } from "@/lib/types";
import { CATEGORIES } from "@/lib/products";
import { ProductImage } from "@/components/ProductImage";
import { ProductCardImage } from "./ProductCardImage";
import { productImageAlt } from "@/lib/products/images";
import { formatPurity } from "@/lib/products/specs";

type ProductWithStock = Product & { stock: { quantity: number; threshold: number } | null };

type SizeForm = {
  label: string;
  priceUsd: string; // blank = not yet priced
  bulkTiers: string; // "minQty:price, minQty:price"
  composition?: SizeOption["composition"]; // not edited here; carried through a save
};

type FormState = {
  slug: string;
  name: string;
  category: string;
  casNumber: string;
  molecularFormula: string;
  molecularWeight: string;
  purityPercent: string;
  sequenceOrForm: string;
  storage: string;
  summary: string;
  description: string; // one paragraph per line
  batchNumbers: string; // comma separated
  sizes: SizeForm[];
  initialStock: string;
  active: boolean;
  costUsd: string;
};

const EMPTY_SIZE: SizeForm = { label: "", priceUsd: "", bulkTiers: "" };

function emptyForm(): FormState {
  return {
    slug: "",
    name: "",
    category: CATEGORIES[1],
    casNumber: "",
    molecularFormula: "",
    molecularWeight: "",
    purityPercent: "",
    sequenceOrForm: "",
    storage: "",
    summary: "",
    description: "",
    batchNumbers: "",
    sizes: [{ ...EMPTY_SIZE }],
    initialStock: "0",
    active: true,
    costUsd: "",
  };
}

function productToForm(p: ProductWithStock): FormState {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category ?? "",
    casNumber: p.casNumber ?? "",
    molecularFormula: p.molecularFormula ?? "",
    molecularWeight: p.molecularWeight ?? "",
    purityPercent: p.purityPercent !== null && p.purityPercent > 0 ? String(p.purityPercent) : "",
    sequenceOrForm: p.sequenceOrForm,
    storage: p.storage,
    summary: p.summary,
    description: p.description.join("\n"),
    batchNumbers: p.batchNumbers.join(", "),
    sizes: p.sizes.map((s) => ({
      label: s.label,
      priceUsd: s.priceUsd !== null ? String(s.priceUsd) : "",
      bulkTiers: (s.bulkTiers ?? []).map((t) => `${t.minQuantity}:${t.priceUsd}`).join(", "),
      composition: s.composition,
    })),
    initialStock: String(p.stock?.quantity ?? 0),
    active: p.active ?? true,
    costUsd: p.costUsd !== undefined ? String(p.costUsd) : "",
  };
}

function parseBulkTiers(text: string): BulkPriceTier[] | undefined {
  const tiers = text
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [minQty, price] = chunk.split(":").map((v) => v.trim());
      return { minQuantity: Number(minQty), priceUsd: Number(price) };
    })
    .filter((t) => Number.isFinite(t.minQuantity) && Number.isFinite(t.priceUsd));
  return tiers.length > 0 ? tiers : undefined;
}

function formToPayload(form: FormState) {
  // A size with no price is kept, unpriced, rather than dropped.
  const sizes: SizeOption[] = form.sizes
    .filter((s) => s.label.trim())
    .map((s) => ({
      label: s.label.trim(),
      priceUsd: s.priceUsd.trim() ? Number(s.priceUsd) : null,
      bulkTiers: parseBulkTiers(s.bulkTiers),
      ...(s.composition?.length ? { composition: s.composition } : {}),
    }));

  return {
    slug: form.slug.trim().toLowerCase(),
    name: form.name.trim(),
    category: form.category || null,
    casNumber: form.casNumber.trim() || null,
    molecularFormula: form.molecularFormula.trim() || null,
    molecularWeight: form.molecularWeight.trim() || null,
    purityPercent: form.purityPercent.trim() ? Number(form.purityPercent) : null,
    sequenceOrForm: form.sequenceOrForm.trim(),
    storage: form.storage.trim(),
    summary: form.summary.trim(),
    description: form.description
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    batchNumbers: form.batchNumbers
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
    sizes,
    initialStock: Number(form.initialStock) || 0,
    active: form.active,
    costUsd: form.costUsd.trim() ? Number(form.costUsd) : undefined,
  };
}

export function ProductsPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [coaDocuments, setCoaDocuments] = useState<Record<string, CoaDocument>>({});
  const [uploadingCoaFor, setUploadingCoaFor] = useState<string | null>(null);
  // The edit form renders below the whole catalog grid, so opening it has to
  // bring it into view (and closing it has to return to the card), or a click
  // on Edit looks like it did nothing. `at` makes a repeat request distinct.
  const [scrollTarget, setScrollTarget] = useState<
    { to: "form"; at: number } | { to: "card"; slug: string; at: number } | null
  >(null);
  const formRef = useRef<HTMLFormElement>(null);
  const openedFrom = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [productsRes, coaRes] = await Promise.all([
      fetch("/api/executive/products", { cache: "no-store" }),
      fetch("/api/executive/coa", { cache: "no-store" }),
    ]);
    if (productsRes.ok) {
      const data = await productsRes.json();
      setProducts(data.products ?? []);
    }
    if (coaRes.ok) {
      const data = await coaRes.json();
      const byBatch: Record<string, CoaDocument> = {};
      for (const doc of data.documents ?? []) byBatch[doc.batchNumber] = doc;
      setCoaDocuments(byBatch);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  function startNew() {
    setForm(emptyForm());
    setEditing("new");
    setError(null);
    openedFrom.current = null;
    setScrollTarget({ to: "form", at: Date.now() });
  }

  function startEdit(product: ProductWithStock) {
    setForm(productToForm(product));
    setEditing(product.slug);
    setError(null);
    openedFrom.current = product.slug;
    setScrollTarget({ to: "form", at: Date.now() });
  }

  function closeEditor(returnTo: string | null = openedFrom.current) {
    setEditing(null);
    setScrollTarget(returnTo ? { to: "card", slug: returnTo, at: Date.now() } : null);
  }

  useEffect(() => {
    if (!scrollTarget || loading) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
    if (scrollTarget.to === "form") {
      const form = formRef.current;
      if (!form) return;
      form.scrollIntoView({ behavior, block: "start" });
      form.querySelector<HTMLElement>("input:not([disabled]), select, textarea")?.focus({ preventScroll: true });
    } else {
      const card = document.querySelector<HTMLElement>(`[data-product-card="${CSS.escape(scrollTarget.slug)}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior, block: "center" });
      card.querySelector<HTMLElement>("[data-edit-button]")?.focus({ preventScroll: true });
    }
    setScrollTarget(null);
  }, [scrollTarget, loading]);

  function updateSize(index: number, patch: Partial<SizeForm>) {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = formToPayload(form);
      const isNew = editing === "new";
      const res = await fetch(
        isNew ? "/api/executive/products" : `/api/executive/products/${form.slug}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isNew ? payload : { ...payload, slug: undefined }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save product.");
      closeEditor(isNew ? form.slug : openedFrom.current);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!window.confirm("Delete this product? This cannot be undone.")) return;
    await fetch(`/api/executive/products/${slug}`, { method: "DELETE" });
    await load();
  }

  async function handleUpload(slug: string, file: File, kind: "gallery") {
    setUploadingFor(slug);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("kind", kind);
      const res = await fetch(`/api/executive/products/${slug}/images`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingFor(null);
    }
  }

  // The card's photo control saves on its own; merge the result in place
  // rather than reloading, which would blank the grid.
  function handlePhotoChange(updated: Product) {
    setProducts((ps) =>
      ps.map((p) =>
        p.slug === updated.slug ? { ...p, imageUrl: updated.imageUrl, primaryImageUrl: updated.primaryImageUrl } : p
      )
    );
  }

  async function handleRemoveImage(slug: string, url: string) {
    await fetch(`/api/executive/products/${slug}/images?url=${encodeURIComponent(url)}`, {
      method: "DELETE",
    });
    await load();
  }

  // Inline edits from the catalog grid (price of the first size, stock,
  // active/hidden) — saved immediately on blur/change, no full form needed.
  async function handleInlinePatch(slug: string, patch: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/executive/products/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save product.");
    }
    await load();
  }

  // A blank box means "still unpriced" — never $0.
  async function handleInlinePriceChange(product: ProductWithStock, value: string) {
    const first = product.sizes[0];
    const priceUsd = Number(value);
    if (!first || !value.trim() || !Number.isFinite(priceUsd) || priceUsd < 0) return;
    if (priceUsd === first.priceUsd) return;
    await handleInlinePatch(product.slug, { sizePrice: { label: first.label, priceUsd } });
  }

  async function handleInlineStockChange(product: ProductWithStock, value: string) {
    const initialStock = Number(value);
    if (!Number.isFinite(initialStock) || initialStock < 0) return;
    await handleInlinePatch(product.slug, { initialStock });
  }

  async function handleToggleActive(product: ProductWithStock) {
    await handleInlinePatch(product.slug, { active: !(product.active ?? true) });
  }

  function handleDropUpload(e: React.DragEvent, slug: string, kind: "gallery") {
    e.preventDefault();
    setDragTarget(null);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(slug, file, kind);
  }

  async function handleReorderGallery(product: ProductWithStock, index: number, direction: -1 | 1) {
    const gallery = [...(product.galleryImageUrls ?? [])];
    const target = index + direction;
    if (target < 0 || target >= gallery.length) return;
    [gallery[index], gallery[target]] = [gallery[target], gallery[index]];
    await handleInlinePatch(product.slug, { galleryImageUrls: gallery });
  }

  async function handleUploadCoa(batch: string, file: File) {
    setUploadingCoaFor(batch);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/executive/coa/${encodeURIComponent(batch)}`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "COA upload failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "COA upload failed.");
    } finally {
      setUploadingCoaFor(null);
    }
  }

  async function handleRemoveCoa(batch: string) {
    await fetch(`/api/executive/coa/${encodeURIComponent(batch)}`, { method: "DELETE" });
    await load();
  }

  const cardClass = isCommand
    ? "command-panel p-6"
    : "office-card";

  const editingProduct = products.find((p) => p.slug === editing) ?? null;

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Catalog</p>
          <button
            type="button"
            onClick={startNew}
            className="border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black"
          >
            + New Product
          </button>
        </div>

        {error && (
          <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-white/30">No products yet.</p>
          ) : (
            products.map((p) => {
              const active = p.active ?? true;
              return (
                <div key={p.slug} data-product-card={p.slug} className={`border bg-black/40 ${active ? "border-white/10" : "border-white/5 opacity-60"}`}>
                  <ProductCardImage product={p} onChange={handlePhotoChange}>
                    <span
                      className={`pointer-events-none absolute left-2 top-2 border px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] ${
                        active
                          ? "border-gold/50 bg-black/70 text-gold"
                          : "border-white/30 bg-black/70 text-white/50"
                      }`}
                    >
                      {active ? "Active" : "Hidden"}
                    </span>
                  </ProductCardImage>
                  <div className="p-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-gold/70">{p.category ?? "Uncategorized"}</p>
                    <p className="mt-1 font-serif text-lg text-white">{p.name}</p>
                    <p className="mt-1 text-xs text-white/40">
                      {formatPurity(p.purityPercent) ? `${formatPurity(p.purityPercent)} purity` : "Purity not set"}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[9px] uppercase tracking-[0.1em] text-white/30">
                          Price (1st size)
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={p.sizes[0]?.priceUsd ?? ""}
                          placeholder="Unpriced"
                          onBlur={(e) => handleInlinePriceChange(p, e.target.value)}
                          className="input-field mt-1 py-1.5 text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] uppercase tracking-[0.1em] text-white/30">Stock</span>
                        <input
                          type="number"
                          min="0"
                          defaultValue={p.stock?.quantity ?? 0}
                          onBlur={(e) => handleInlineStockChange(p, e.target.value)}
                          className="input-field mt-1 py-1.5 text-xs"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        data-edit-button
                        className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(p)}
                        className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
                      >
                        {active ? "Hide" : "Unhide"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.slug)}
                        className="border border-red-500/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {editing && (
        <form ref={formRef} onSubmit={handleSave} className={`${cardClass} scroll-mt-6`}>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">
            {editing === "new" ? "New Product" : `Edit — ${form.name}`}
          </p>
          {editing === "new" && (
            <p className="mt-1 text-xs text-white/40">
              Save the product first, then reopen it to upload photos.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              required
              disabled={editing !== "new"}
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="slug (e.g. bpc-157)"
              className="input-field disabled:opacity-50"
            />
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              className="input-field"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="input-field"
            >
              <option value="">Uncategorized</option>
              {CATEGORIES.filter((c) => c !== "All").map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="input-field flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 accent-gold"
              />
              <span className="text-sm text-white/70">
                {form.active ? "Active — visible in shop" : "Hidden — pulled from shop"}
              </span>
            </label>
            {/* Specs are optional: anything left blank stays off the storefront. */}
            <input
              value={form.casNumber}
              onChange={(e) => setForm((f) => ({ ...f, casNumber: e.target.value }))}
              placeholder="CAS Number (optional)"
              aria-label="CAS Number"
              className="input-field"
            />
            <input
              value={form.molecularFormula}
              onChange={(e) => setForm((f) => ({ ...f, molecularFormula: e.target.value }))}
              placeholder="Molecular Formula (optional)"
              aria-label="Molecular Formula"
              className="input-field"
            />
            <input
              value={form.molecularWeight}
              onChange={(e) => setForm((f) => ({ ...f, molecularWeight: e.target.value }))}
              placeholder="Molecular Weight, e.g. 1419.53 g/mol (optional)"
              aria-label="Molecular Weight"
              className="input-field"
            />
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              value={form.purityPercent}
              onChange={(e) => setForm((f) => ({ ...f, purityPercent: e.target.value }))}
              placeholder="Purity % (blank until tested)"
              aria-label="Purity %"
              className="input-field"
            />
            <input
              required
              type="number"
              min="0"
              value={form.initialStock}
              onChange={(e) => setForm((f) => ({ ...f, initialStock: e.target.value }))}
              placeholder="Stock quantity"
              className="input-field"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.costUsd}
              onChange={(e) => setForm((f) => ({ ...f, costUsd: e.target.value }))}
              placeholder="Cost of goods (USD, optional — for margin reporting)"
              className="input-field"
            />
            <input
              value={form.sequenceOrForm}
              onChange={(e) => setForm((f) => ({ ...f, sequenceOrForm: e.target.value }))}
              placeholder="Sequence / Form (optional)"
              className="input-field sm:col-span-2"
            />
            <input
              value={form.storage}
              onChange={(e) => setForm((f) => ({ ...f, storage: e.target.value }))}
              placeholder="Storage instructions (optional)"
              className="input-field sm:col-span-2"
            />
            <input
              value={form.batchNumbers}
              onChange={(e) => setForm((f) => ({ ...f, batchNumbers: e.target.value }))}
              placeholder="Batch numbers, comma separated"
              className="input-field sm:col-span-2"
            />
            <textarea
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="Short summary (optional)"
              rows={2}
              className="input-field sm:col-span-2"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description — one paragraph per line (optional)"
              rows={4}
              className="input-field sm:col-span-2"
            />
          </div>

          {editingProduct && editingProduct.batchNumbers.length > 0 && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-gold">Certificates of Analysis</p>
              <div className="mt-3 space-y-2">
                {editingProduct.batchNumbers.map((batch) => {
                  const doc = coaDocuments[batch];
                  return (
                    <div
                      key={batch}
                      className="flex flex-wrap items-center justify-between gap-3 border border-white/10 px-3 py-2"
                    >
                      <span className="font-mono text-xs text-white/70">{batch}</span>
                      <div className="flex items-center gap-2">
                        {doc && (
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] uppercase tracking-[0.1em] text-gold hover:text-white"
                          >
                            View File
                          </a>
                        )}
                        <label className="cursor-pointer border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold">
                          {uploadingCoaFor === batch ? "Uploading..." : doc ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadCoa(batch, file);
                            }}
                          />
                        </label>
                        {doc && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCoa(batch)}
                            className="border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-gold">Sizes & Pricing</p>
            <div className="mt-3 space-y-3">
              {form.sizes.map((size, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <input
                    value={size.label}
                    onChange={(e) => updateSize(i, { label: e.target.value })}
                    placeholder="Size (e.g. 5 mg)"
                    className="input-field"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={size.priceUsd}
                    onChange={(e) => updateSize(i, { priceUsd: e.target.value })}
                    placeholder="Price USD (blank = not for sale)"
                    className="input-field"
                  />
                  <input
                    value={size.bulkTiers}
                    onChange={(e) => updateSize(i, { bulkTiers: e.target.value })}
                    placeholder="Bulk tiers: minQty:price, e.g. 3:38, 5:32"
                    className="input-field sm:col-span-2"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, sizes: [...f.sizes, { ...EMPTY_SIZE }] }))}
                className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
              >
                + Add Size
              </button>
              {form.sizes.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, sizes: f.sizes.slice(0, -1) }))
                  }
                  className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white"
                >
                  Remove Last
                </button>
              )}
            </div>
          </div>

          {editingProduct && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-gold">Images</p>
              <p className="mt-1 text-[10px] text-white/30">
                The main photo is set from the product&apos;s card above: click its image, or drop a file on it.
              </p>
              <div className="mt-3 flex flex-wrap gap-4">

                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-white/40">
                    Gallery (reorder with the arrows)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(editingProduct.galleryImageUrls ?? []).map((url, i) => (
                      <div key={url} className="relative h-24 w-24">
                        <ProductImage sources={[url]} name={editingProduct.name} alt={productImageAlt(editingProduct)} />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(editingProduct.slug, url)}
                          className="absolute -right-1 -top-1 h-5 w-5 border border-red-500/40 bg-black text-[10px] text-red-300 hover:bg-red-500/20"
                        >
                          ×
                        </button>
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/80 px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => handleReorderGallery(editingProduct, i, -1)}
                            disabled={i === 0}
                            title="Move left"
                            className="text-[10px] text-white/60 hover:text-gold disabled:opacity-20"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReorderGallery(editingProduct, i, 1)}
                            disabled={i === (editingProduct.galleryImageUrls?.length ?? 1) - 1}
                            title="Move right"
                            className="text-[10px] text-white/60 hover:text-gold disabled:opacity-20"
                          >
                            →
                          </button>
                        </div>
                      </div>
                    ))}
                    <label
                      className={`flex h-24 w-24 cursor-pointer items-center justify-center border border-dashed text-[10px] uppercase tracking-[0.1em] hover:border-gold hover:text-gold ${
                        dragTarget === "gallery" ? "border-gold text-gold" : "border-white/20 text-white/40"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragTarget("gallery");
                      }}
                      onDragLeave={() => setDragTarget(null)}
                      onDrop={(e) => handleDropUpload(e, editingProduct.slug, "gallery")}
                    >
                      {uploadingFor === editingProduct.slug ? "..." : "+ Add"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(editingProduct.slug, file, "gallery");
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Product"}
            </button>
            <button
              type="button"
              onClick={() => closeEditor()}
              className="border border-white/15 px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
