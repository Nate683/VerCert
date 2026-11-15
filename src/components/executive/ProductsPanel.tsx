"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BulkPriceTier, Product, SizeOption } from "@/lib/types";
import { CATEGORIES } from "@/lib/products";
import { ProductCardImage } from "./ProductCardImage";
import { ProductGalleryEditor } from "./ProductGalleryEditor";
import { formatPurity } from "@/lib/products/specs";
import { AVAILABILITY_LABELS, DEFAULT_AVAILABILITY_STATUS, strengthStatus } from "@/lib/products/availability";
import { StrengthPanel, type SizeForm } from "./StrengthPanel";
import { STOCK_LEVEL_LABELS, type StockLevel } from "@/lib/inventory-shared";

// Stage 2: each strength's stock, by permanent id — shown read-only here; changed only by a recorded adjustment
// in the Stock tab.
export type StrengthStockSummary = { physical: number; reserved: number; available: number; threshold: number; level: StockLevel };
type ProductWithStock = Product & { strengthStock?: Record<string, StrengthStockSummary> };


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
  active: boolean;
  costUsd: string;
};

// Availability status and the estimated date are per strength (Stage 1); the
// product's own columns are kept as they are and not edited here.
const EMPTY_SIZE: SizeForm = {
  label: "",
  priceUsd: "",
  bulkTiers: "",
  costUsd: "",
  active: true,
  availabilityStatus: DEFAULT_AVAILABILITY_STATUS,
  estimatedAvailableOn: "",
};

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
    // Every strength, deactivated ones included (they stay editable and can be reactivated).
    sizes: p.sizes.map((s) => ({
      id: s.id,
      sku: s.sku,
      savedLabel: s.label,
      label: s.label,
      priceUsd: s.priceUsd !== null ? String(s.priceUsd) : "",
      bulkTiers: (s.bulkTiers ?? []).map((t) => `${t.minQuantity}:${t.priceUsd}`).join(", "),
      costUsd: s.costUsd !== undefined ? String(s.costUsd) : "",
      stock: s.id ? p.strengthStock?.[s.id] ?? null : null,
      active: s.active !== false,
      availabilityStatus: strengthStatus(p, s),
      estimatedAvailableOn: s.estimatedAvailableOn ?? "",
      imageUrl: s.imageUrl ?? null,
      composition: s.composition,
    })),
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
      ...(s.id ? { id: s.id } : {}),
      label: s.label.trim(),
      priceUsd: s.priceUsd.trim() ? Number(s.priceUsd) : null,
      bulkTiers: parseBulkTiers(s.bulkTiers),
      ...(s.costUsd.trim() ? { costUsd: Number(s.costUsd) } : {}),
      ...(s.composition?.length ? { composition: s.composition } : {}),
      active: s.active,
      availabilityStatus: s.availabilityStatus,
      // Sent every save: a date, or null to clear. Never changed by a status change.
      estimatedAvailableOn: s.estimatedAvailableOn || null,
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
    // Stage 2: no stock here — it changes only through recorded adjustments in the Stock tab.
    active: form.active,
    costUsd: form.costUsd.trim() ? Number(form.costUsd) : undefined,
  };
}

// Checked before a save is sent, so a mistake is shown at once (the server checks the same and more).
function formProblem(form: FormState): string | null {
  const labels = form.sizes.map((s) => s.label.trim());
  if (labels.some((l) => !l)) return "Every strength needs a strength designation (e.g. 10mg), or remove the empty one.";
  const seen = new Set<string>();
  for (const l of labels) {
    const key = l.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return `Two strengths are both "${l}". Each strength must be different.`;
    seen.add(key);
  }
  for (const s of form.sizes) {
    if (s.priceUsd.trim() && !(Number(s.priceUsd) >= 0)) return `${s.label}: the retail price must be a number of 0 or more.`;
    if (s.costUsd.trim() && !(Number(s.costUsd) >= 0)) return `${s.label}: the cost of goods must be a number of 0 or more.`;
  }
  return null;
}

export function ProductsPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const productsRes = await fetch("/api/executive/products", { cache: "no-store" });
    if (productsRes.ok) {
      const data = await productsRes.json();
      setProducts(data.products ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  // B3 (Stage 2): the product being edited is kept in ?edit=<slug> beside ?tab=products, so a browser refresh
  // reopens its editor (from the saved data — nothing is saved automatically). The form as opened is remembered;
  // while it differs, leaving or refreshing the page asks first (beforeunload), and Cancel / opening another product
  // asks too.
  const openedForm = useRef<string>("");
  const restored = useRef(false);
  const setEditParam = (slug: string | null) => {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("edit", slug);
    else url.searchParams.delete("edit");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  // A vial image saves on its own (StrengthImageControl), so it never counts as an unsaved change.
  const snap = (f: FormState) => JSON.stringify(f, (k, v) => (k === "imageUrl" ? undefined : v));
  const dirty = editing !== null && snap(form) !== openedForm.current;
  const confirmDiscard = () => !dirty || window.confirm("Discard your unsaved changes to this product?");
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // After the first load, reopen the editor named in ?edit= (if that product still exists).
  useEffect(() => {
    if (loading || restored.current) return;
    restored.current = true;
    const slug = new URLSearchParams(window.location.search).get("edit");
    const product = slug ? products.find((p) => p.slug === slug) : undefined;
    if (product) startEdit(product);
    else if (slug) setEditParam(null);
  }, [loading, products]); // eslint-disable-line react-hooks/exhaustive-deps

  function startNew() {
    if (!confirmDiscard()) return;
    const fresh = emptyForm();
    setForm(fresh);
    openedForm.current = snap(fresh);
    setEditing("new");
    setEditParam(null); // a product not saved yet has nothing to restore
    setError(null);
    openedFrom.current = null;
    setScrollTarget({ to: "form", at: Date.now() });
  }

  function startEdit(product: ProductWithStock) {
    if (editing !== product.slug && !confirmDiscard()) return;
    const opened = productToForm(product);
    setForm(opened);
    openedForm.current = snap(opened);
    setEditing(product.slug);
    setEditParam(product.slug);
    setError(null);
    openedFrom.current = product.slug;
    setScrollTarget({ to: "form", at: Date.now() });
  }

  function closeEditor(returnTo: string | null = openedFrom.current) {
    openedForm.current = "";
    setEditing(null);
    setEditParam(null);
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
    const problem = formProblem(form);
    if (problem) {
      // Nothing is sent and nothing in the form is cleared.
      setError(problem);
      return;
    }
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

  // The card's photo control saves on its own; merge the result in place
  // rather than reloading, which would blank the grid.
  function handlePhotoChange(updated: Product) {
    setProducts((ps) =>
      ps.map((p) =>
        p.slug === updated.slug ? { ...p, imageUrl: updated.imageUrl, primaryImageUrl: updated.primaryImageUrl } : p
      )
    );
  }

  function handleGalleryChange(updated: Product) {
    setProducts((ps) =>
      ps.map((p) => (p.slug === updated.slug ? { ...p, galleryImageUrls: updated.galleryImageUrls } : p))
    );
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

  // A blank box means "still unpriced" — never $0. The first ACTIVE strength, by its permanent id.
  async function handleInlinePriceChange(product: ProductWithStock, value: string) {
    const first = product.sizes.find((s) => s.active !== false);
    const priceUsd = Number(value);
    if (!first || !value.trim() || !Number.isFinite(priceUsd) || priceUsd < 0) return;
    if (priceUsd === first.priceUsd) return;
    await handleInlinePatch(product.slug, { sizePrice: { ...(first.id ? { id: first.id } : {}), label: first.label, priceUsd } });
  }

  // A strength's vial image saves on its own (like the product photo); merge the result into the grid and the form.
  function handleStrengthImageChange(updated: Product) {
    setProducts((ps) => ps.map((p) => (p.slug === updated.slug ? { ...p, sizes: updated.sizes } : p)));
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s) => (s.id ? { ...s, imageUrl: updated.sizes.find((u) => u.id === s.id)?.imageUrl ?? null } : s)),
    }));
  }

  async function handleToggleActive(product: ProductWithStock) {
    await handleInlinePatch(product.slug, { active: !(product.active ?? true) });
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
            className="border border-[var(--x-border-strong)] px-4 py-2 text-xs uppercase tracking-[0.15em] text-[var(--x-text)] transition-colors hover:bg-[var(--x-raised)] hover:border-[var(--x-text)]"
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
                <div key={p.slug} data-product-card={p.slug} className={`border bg-[var(--x-base)]/40 ${active ? "border-white/10" : "border-white/5 opacity-60"}`}>
                  <ProductCardImage product={p} onChange={handlePhotoChange} />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[10px] uppercase tracking-[0.15em] text-[var(--x-muted)]">{p.category ?? "Uncategorized"}</p>
                      <span
                        className={`shrink-0 border px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] ${
                          active ? "border-[var(--x-border-strong)] text-[var(--x-text-2)]" : "border-white/15 text-white/40"
                        }`}
                      >
                        {active ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-1 font-serif text-lg text-white">{p.name}</p>
                    {/* Each strength's own status (Stage 1); deactivated strengths are marked. */}
                    <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-white/50" data-strength-summary>
                      {p.sizes
                        .map((s) => `${s.label}: ${s.active === false ? "Deactivated" : AVAILABILITY_LABELS[strengthStatus(p, s)]}`)
                        .join(" · ")}
                    </p>
                    {formatPurity(p.purityPercent) && (
                      <p className="mt-1 text-xs text-white/40">{formatPurity(p.purityPercent)} purity</p>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[9px] uppercase tracking-[0.1em] text-white/30">
                          Price ({p.sizes.find((s) => s.active !== false)?.label ?? "first strength"})
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={p.sizes.find((s) => s.active !== false)?.priceUsd ?? ""}
                          placeholder="Unpriced"
                          onBlur={(e) => handleInlinePriceChange(p, e.target.value)}
                          className="input-field mt-1 py-1.5 text-xs"
                        />
                      </label>
                      {/* Stage 2: read-only available stock per strength; changed in the Stock tab. */}
                      <div className="block" data-card-stock>
                        <span className="text-[9px] uppercase tracking-[0.1em] text-white/30">Available stock</span>
                        <p className="mt-1 py-1.5 text-xs text-white/70">
                          {p.sizes
                            .map((s) => {
                              const st = s.id ? p.strengthStock?.[s.id] : undefined;
                              return `${s.label}: ${st ? `${st.available}${st.level === "healthy" ? "" : ` (${STOCK_LEVEL_LABELS[st.level].toLowerCase()})`}` : "—"}`;
                            })
                            .join(" · ")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        data-edit-button
                        className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(p)}
                        className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]"
                      >
                        {active ? "Hide" : "Unhide"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.slug)}
                        className="border border-[var(--x-border-strong)] px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--x-text-2)] hover:border-[var(--x-negative)] hover:text-red-300 hover:text-[var(--x-negative)]"
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
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">
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
            {/* Availability status and the estimated availability date are set
                per strength, under Sizes & Pricing below (Stage 1). Visibility
                is the product-wide checkbox here; neither changes the other. */}
            <p className="self-center text-[11px] text-white/40">
              Availability status and estimated dates are set for each strength under Sizes &amp; Pricing.
            </p>
            <label className="input-field flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 accent-gold"
              />
              <span className="text-sm text-white/70">
                {form.active ? "Visible in shop" : "Hidden — pulled from shop"}
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
            {/* Stage 2: the shared stock box is gone — stock is per strength and changes only through recorded
                adjustments in Executive Office → Stock. */}
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
              placeholder="Lot numbers, comma separated"
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
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Certificates of Analysis</p>
              <p className="mt-2 text-xs leading-relaxed text-white/60">
                Certificates for these lots ({editingProduct.batchNumbers.join(", ")}) are uploaded, reviewed, approved and
                published in the Certificates tab.
              </p>
            </div>
          )}

          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Sizes & Pricing</p>
            <p className="mt-1 text-[11px] text-white/40">
              Each strength is its own SKU. Open one to edit it; every change is saved together by Save Product.
            </p>
            <div className="mt-3 space-y-2">
              {form.sizes.map((size, i) => (
                <StrengthPanel
                  key={size.id ?? `new-${i}`}
                  index={i}
                  size={size}
                  product={editingProduct}
                  // Immediate warning (B1): another strength of this product has the same designation, ignoring
                  // case and spaces — the same comparison the server and the database index make.
                  duplicate={Boolean(size.label.trim()) && form.sizes.some((o, j) => j !== i && o.label.toLowerCase().replace(/\s+/g, "") === size.label.toLowerCase().replace(/\s+/g, ""))}
                  onChange={(patch) => updateSize(i, patch)}
                  onRemove={size.id ? undefined : () => setForm((f) => ({ ...f, sizes: f.sizes.filter((_, j) => j !== i) }))}
                  onImageChange={handleStrengthImageChange}
                />
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, sizes: [...f.sizes, { ...EMPTY_SIZE }] }))}
                className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]"
              >
                + Add Strength
              </button>
            </div>
          </div>

          {editingProduct && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Images</p>
              <p className="mt-1 text-[10px] text-white/30">
                The main photo is set from the product&apos;s card above: click its image, or drop a file on it.
              </p>
              <div className="mt-3 flex flex-wrap gap-4">

                <ProductGalleryEditor product={editingProduct} onChange={handleGalleryChange} />
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="border border-[var(--x-muted)] bg-[var(--x-raised)] px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-[var(--x-text)] transition-colors hover:border-[var(--x-text)] disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Product"}
            </button>
            <button
              type="button"
              onClick={() => confirmDiscard() && closeEditor()}
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
