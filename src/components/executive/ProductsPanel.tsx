"use client";

import { useCallback, useEffect, useState } from "react";
import type { BulkPriceTier, CoaDocument, Product, SizeOption } from "@/lib/types";
import { CATEGORIES } from "@/lib/products";
import { ProductImage } from "@/components/ProductImage";

type ProductWithStock = Product & { stock: { quantity: number; threshold: number } | null };

type SizeForm = {
  label: string;
  priceUsd: string;
  bulkTiers: string; // "minQty:price, minQty:price"
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
  };
}

function productToForm(p: ProductWithStock): FormState {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    casNumber: p.casNumber,
    molecularFormula: p.molecularFormula,
    molecularWeight: p.molecularWeight,
    purityPercent: String(p.purityPercent),
    sequenceOrForm: p.sequenceOrForm,
    storage: p.storage,
    summary: p.summary,
    description: p.description.join("\n"),
    batchNumbers: p.batchNumbers.join(", "),
    sizes: p.sizes.map((s) => ({
      label: s.label,
      priceUsd: String(s.priceUsd),
      bulkTiers: (s.bulkTiers ?? []).map((t) => `${t.minQuantity}:${t.priceUsd}`).join(", "),
    })),
    initialStock: String(p.stock?.quantity ?? 0),
    active: p.active ?? true,
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
  const sizes: SizeOption[] = form.sizes
    .filter((s) => s.label.trim() && s.priceUsd.trim())
    .map((s) => ({
      label: s.label.trim(),
      priceUsd: Number(s.priceUsd),
      bulkTiers: parseBulkTiers(s.bulkTiers),
    }));

  return {
    slug: form.slug.trim().toLowerCase(),
    name: form.name.trim(),
    category: form.category,
    casNumber: form.casNumber.trim(),
    molecularFormula: form.molecularFormula.trim(),
    molecularWeight: form.molecularWeight.trim(),
    purityPercent: Number(form.purityPercent),
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
  }

  function startEdit(product: ProductWithStock) {
    setForm(productToForm(product));
    setEditing(product.slug);
    setError(null);
  }

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
      setEditing(null);
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

  async function handleUpload(slug: string, file: File, kind: "primary" | "gallery") {
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

  async function handleRemoveImage(slug: string, url: string) {
    await fetch(`/api/executive/products/${slug}/images?url=${encodeURIComponent(url)}`, {
      method: "DELETE",
    });
    await load();
  }

  // Inline edits from the catalog grid (price of the first size, stock,
  // active/hidden) — saved immediately on blur/change, no full form needed.
  async function handleInlinePatch(slug: string, patch: Record<string, unknown>) {
    await fetch(`/api/executive/products/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function handleInlinePriceChange(product: ProductWithStock, value: string) {
    const priceUsd = Number(value);
    if (!Number.isFinite(priceUsd) || priceUsd < 0) return;
    const sizes = product.sizes.map((s, i) => (i === 0 ? { ...s, priceUsd } : s));
    await handleInlinePatch(product.slug, { sizes });
  }

  async function handleInlineStockChange(product: ProductWithStock, value: string) {
    const initialStock = Number(value);
    if (!Number.isFinite(initialStock) || initialStock < 0) return;
    await handleInlinePatch(product.slug, { initialStock });
  }

  async function handleToggleActive(product: ProductWithStock) {
    await handleInlinePatch(product.slug, { active: !(product.active ?? true) });
  }

  function handleDropUpload(e: React.DragEvent, slug: string, kind: "primary" | "gallery") {
    e.preventDefault();
    setDragTarget(null);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(slug, file, kind);
  }

  async function handleSetPrimary(product: ProductWithStock, url: string) {
    const gallery = (product.galleryImageUrls ?? []).filter((u) => u !== url);
    if (product.primaryImageUrl) gallery.push(product.primaryImageUrl);
    await handleInlinePatch(product.slug, { primaryImageUrl: url, galleryImageUrls: gallery });
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
    ? "border border-gold/20 bg-white/[0.02] p-6"
    : "rounded-md border border-white/10 bg-white/[0.03] p-5";

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
                <div key={p.slug} className={`border bg-black/40 ${active ? "border-white/10" : "border-white/5 opacity-60"}`}>
                  <div className="relative">
                    <ProductImage src={p.primaryImageUrl} name={p.name} />
                    <span
                      className={`absolute left-2 top-2 border px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] ${
                        active
                          ? "border-gold/50 bg-black/70 text-gold"
                          : "border-white/30 bg-black/70 text-white/50"
                      }`}
                    >
                      {active ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-gold/70">{p.category}</p>
                    <p className="mt-1 font-serif text-lg text-white">{p.name}</p>
                    <p className="mt-1 text-xs text-white/40">{p.purityPercent.toFixed(1)}% purity</p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[9px] uppercase tracking-[0.1em] text-white/30">
                          Price (1st size)
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={p.sizes[0]?.priceUsd ?? 0}
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
        <form onSubmit={handleSave} className={cardClass}>
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
                className="h-4 w-4 accent-[#c9a227]"
              />
              <span className="text-sm text-white/70">
                {form.active ? "Active — visible in shop" : "Hidden — pulled from shop"}
              </span>
            </label>
            <input
              required
              value={form.casNumber}
              onChange={(e) => setForm((f) => ({ ...f, casNumber: e.target.value }))}
              placeholder="CAS Number"
              className="input-field"
            />
            <input
              required
              value={form.molecularFormula}
              onChange={(e) => setForm((f) => ({ ...f, molecularFormula: e.target.value }))}
              placeholder="Molecular Formula"
              className="input-field"
            />
            <input
              required
              value={form.molecularWeight}
              onChange={(e) => setForm((f) => ({ ...f, molecularWeight: e.target.value }))}
              placeholder="Molecular Weight (e.g. 1419.53 g/mol)"
              className="input-field"
            />
            <input
              required
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={form.purityPercent}
              onChange={(e) => setForm((f) => ({ ...f, purityPercent: e.target.value }))}
              placeholder="Purity %"
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
              required
              value={form.sequenceOrForm}
              onChange={(e) => setForm((f) => ({ ...f, sequenceOrForm: e.target.value }))}
              placeholder="Sequence / Form"
              className="input-field sm:col-span-2"
            />
            <input
              required
              value={form.storage}
              onChange={(e) => setForm((f) => ({ ...f, storage: e.target.value }))}
              placeholder="Storage instructions"
              className="input-field sm:col-span-2"
            />
            <input
              value={form.batchNumbers}
              onChange={(e) => setForm((f) => ({ ...f, batchNumbers: e.target.value }))}
              placeholder="Batch numbers, comma separated"
              className="input-field sm:col-span-2"
            />
            <textarea
              required
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="Short summary (shown on product card)"
              rows={2}
              className="input-field sm:col-span-2"
            />
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description — one paragraph per line"
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
                    placeholder="Price USD"
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
              <p className="mt-1 text-[10px] text-white/30">Drag and drop a photo onto a box, or use the buttons.</p>
              <div className="mt-3 flex flex-wrap gap-4">
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-white/40">Primary</p>
                  <div
                    className={`h-24 w-24 ${dragTarget === "primary" ? "ring-2 ring-gold" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragTarget("primary");
                    }}
                    onDragLeave={() => setDragTarget(null)}
                    onDrop={(e) => handleDropUpload(e, editingProduct.slug, "primary")}
                  >
                    <ProductImage src={editingProduct.primaryImageUrl} name={editingProduct.name} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <label className="cursor-pointer border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold">
                      {uploadingFor === editingProduct.slug ? "Uploading..." : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(editingProduct.slug, file, "primary");
                        }}
                      />
                    </label>
                    {editingProduct.primaryImageUrl && (
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(editingProduct.slug, editingProduct.primaryImageUrl!)}
                        className="border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-white/40">
                    Gallery (drag to reorder with the arrows, or set as primary)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(editingProduct.galleryImageUrls ?? []).map((url, i) => (
                      <div key={url} className="relative h-24 w-24">
                        <ProductImage src={url} name={editingProduct.name} />
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
                            onClick={() => handleSetPrimary(editingProduct, url)}
                            title="Set as primary"
                            className="text-[9px] uppercase tracking-[0.05em] text-white/60 hover:text-gold"
                          >
                            ★
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
              onClick={() => setEditing(null)}
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
