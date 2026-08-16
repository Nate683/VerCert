"use client";

import { useCallback, useEffect, useState } from "react";
import type { PromoCodeStats, PromoType } from "@/lib/types";
import { CATEGORIES } from "@/lib/products";

type ProductOption = { slug: string; name: string; category: string };

type FormState = {
  code: string;
  type: PromoType;
  value: string;
  minOrderAmount: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  restrictedProductSlugs: string[];
  restrictedCategories: string[];
};

function emptyForm(): FormState {
  return {
    code: "",
    type: "percent",
    value: "10",
    minOrderAmount: "0",
    usageLimit: "",
    perCustomerLimit: "",
    startsAt: "",
    endsAt: "",
    active: true,
    restrictedProductSlugs: [],
    restrictedCategories: [],
  };
}

function promoToForm(p: PromoCodeStats): FormState {
  return {
    code: p.code,
    type: p.type,
    value: String(p.value),
    minOrderAmount: String(p.minOrderAmount),
    usageLimit: p.usageLimit !== undefined ? String(p.usageLimit) : "",
    perCustomerLimit: p.perCustomerLimit !== undefined ? String(p.perCustomerLimit) : "",
    startsAt: p.startsAt ? p.startsAt.slice(0, 10) : "",
    endsAt: p.endsAt ? p.endsAt.slice(0, 10) : "",
    active: p.active,
    restrictedProductSlugs: p.restrictedProductSlugs ?? [],
    restrictedCategories: p.restrictedCategories ?? [],
  };
}

function formToPayload(form: FormState) {
  return {
    code: form.code.trim(),
    type: form.type,
    value: form.type === "free_shipping" ? 0 : Number(form.value) || 0,
    minOrderAmount: Number(form.minOrderAmount) || 0,
    usageLimit: form.usageLimit.trim() ? Number(form.usageLimit) : undefined,
    perCustomerLimit: form.perCustomerLimit.trim() ? Number(form.perCustomerLimit) : undefined,
    startsAt: form.startsAt || undefined,
    endsAt: form.endsAt || undefined,
    active: form.active,
    restrictedProductSlugs: form.restrictedProductSlugs.length > 0 ? form.restrictedProductSlugs : undefined,
    restrictedCategories: form.restrictedCategories.length > 0 ? form.restrictedCategories : undefined,
  };
}

function formatType(type: PromoType, value: number) {
  if (type === "percent") return `${value}% off`;
  if (type === "fixed") return `$${value.toFixed(2)} off`;
  return "Free shipping";
}

// /command-only tab: promo codes + the site-wide sale banner.
export function PromotionsPanel() {
  const [promoCodes, setPromoCodes] = useState<PromoCodeStats[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [banner, setBanner] = useState({ active: false, message: "", linkHref: "" });
  const [bannerSaving, setBannerSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [promoRes, productsRes, contentRes] = await Promise.all([
      fetch("/api/executive/promotions", { cache: "no-store" }),
      fetch("/api/executive/products", { cache: "no-store" }),
      fetch("/api/executive/content", { cache: "no-store" }),
    ]);
    if (promoRes.ok) setPromoCodes((await promoRes.json()).promoCodes ?? []);
    if (productsRes.ok) setProducts((await productsRes.json()).products ?? []);
    if (contentRes.ok) {
      const data = await contentRes.json();
      if (data.saleBanner) setBanner(data.saleBanner);
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

  function startEdit(promo: PromoCodeStats) {
    setForm(promoToForm(promo));
    setEditing(promo.id);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = formToPayload(form);
      const isNew = editing === "new";
      const res = await fetch(
        isNew ? "/api/executive/promotions" : `/api/executive/promotions/${editing}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isNew ? payload : { ...payload, code: undefined }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save promo code.");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save promo code.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this promo code? This cannot be undone.")) return;
    await fetch(`/api/executive/promotions/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleToggleActive(promo: PromoCodeStats) {
    await fetch(`/api/executive/promotions/${promo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !promo.active }),
    });
    await load();
  }

  async function handleSaveBanner() {
    setBannerSaving(true);
    try {
      await fetch("/api/executive/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "sale_banner", value: banner }),
      });
    } finally {
      setBannerSaving(false);
    }
  }

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const cardClass = "command-panel p-6";

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Site-Wide Sale Banner</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={banner.active}
              onChange={(e) => setBanner((b) => ({ ...b, active: e.target.checked }))}
              className="h-4 w-4 accent-[#c9a227]"
            />
            <span className="text-sm text-white/70">Show announcement banner site-wide</span>
          </label>
          <input
            value={banner.message}
            onChange={(e) => setBanner((b) => ({ ...b, message: e.target.value }))}
            placeholder="e.g. Summer Sale — 15% off with code SUMMER15"
            className="input-field sm:col-span-2"
          />
          <input
            value={banner.linkHref}
            onChange={(e) => setBanner((b) => ({ ...b, linkHref: e.target.value }))}
            placeholder="Optional link (e.g. /shop)"
            className="input-field sm:col-span-2"
          />
        </div>
        <button
          type="button"
          onClick={handleSaveBanner}
          disabled={bannerSaving}
          className="mt-4 border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
        >
          {bannerSaving ? "Saving..." : "Save Banner"}
        </button>
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Promo Codes</p>
          <button
            type="button"
            onClick={startNew}
            className="border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black"
          >
            + New Code
          </button>
        </div>

        {error && (
          <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>
        )}

        <div className="mt-6 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : promoCodes.length === 0 ? (
            <p className="text-sm text-white/30">No promo codes yet.</p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-xs uppercase tracking-[0.1em] text-white/40">
                  <th className="pb-3 pr-4 font-normal">Code</th>
                  <th className="pb-3 pr-4 font-normal">Discount</th>
                  <th className="pb-3 pr-4 font-normal">Usage</th>
                  <th className="pb-3 pr-4 font-normal">Revenue</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promoCodes.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 align-top text-white/80">
                    <td className="py-3 pr-4 font-mono text-xs">{p.code}</td>
                    <td className="py-3 pr-4">{formatType(p.type, p.value)}</td>
                    <td className="py-3 pr-4 text-xs text-white/50">
                      {p.redemptions}
                      {p.usageLimit !== undefined ? ` / ${p.usageLimit}` : ""}
                    </td>
                    <td className="py-3 pr-4 text-xs text-white/50">${p.revenueAttributed.toFixed(2)}</td>
                    <td className="py-3 pr-4">
                      <span className={p.active ? "text-gold" : "text-white/40"}>
                        {p.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
                        >
                          {p.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSave} className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">
            {editing === "new" ? "New Promo Code" : `Edit — ${form.code}`}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              required
              disabled={editing !== "new"}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="CODE (e.g. SUMMER15)"
              className="input-field disabled:opacity-50"
            />
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PromoType }))}
              className="input-field"
            >
              <option value="percent">Percentage Off</option>
              <option value="fixed">Fixed Dollar Off</option>
              <option value="free_shipping">Free Shipping</option>
            </select>
            {form.type !== "free_shipping" && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.type === "percent" ? "Percent off (e.g. 15)" : "Dollars off (e.g. 10)"}
                className="input-field"
              />
            )}
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.minOrderAmount}
              onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
              placeholder="Minimum order amount"
              className="input-field"
            />
            <input
              type="number"
              min="1"
              value={form.usageLimit}
              onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
              placeholder="Total usage limit (optional)"
              className="input-field"
            />
            <input
              type="number"
              min="1"
              value={form.perCustomerLimit}
              onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))}
              placeholder="Per-customer limit (optional)"
              className="input-field"
            />
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">Start date</span>
              <input
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                className="input-field mt-1"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">End date</span>
              <input
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="input-field mt-1"
              />
            </label>
            <label className="input-field flex items-center gap-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 accent-[#c9a227]"
              />
              <span className="text-sm text-white/70">Active</span>
            </label>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-gold">
              Restrict to Categories (optional — leave empty to apply to whole order)
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c !== "All").map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, restrictedCategories: toggleInList(f.restrictedCategories, c) }))
                  }
                  className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] ${
                    form.restrictedCategories.includes(c)
                      ? "border-gold text-gold"
                      : "border-white/20 text-white/50 hover:border-white/40"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-gold">
              Restrict to Specific Products (optional)
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {products.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      restrictedProductSlugs: toggleInList(f.restrictedProductSlugs, p.slug),
                    }))
                  }
                  className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] ${
                    form.restrictedProductSlugs.includes(p.slug)
                      ? "border-gold text-gold"
                      : "border-white/20 text-white/50 hover:border-white/40"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Code"}
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
