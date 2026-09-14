"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { useExecMode } from "@/lib/exec-mode-context";

// "from $40" hid the spread on products whose sizes differ by an order of
// magnitude. Show the range, and collapse to a single figure when there is
// only one size or every size costs the same.
function priceRange(product: Product): string {
  const prices = product.sizes.map((s) => s.priceUsd);
  if (prices.length === 0) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min}` : `$${min} – $${max}`;
}

// pricingLocked is for signed-out visitors: their product arrives without its
// sizes (see withoutPricing), so the tile offers sign-in instead of a price.
export function ProductCard({ product, pricingLocked = false }: { product: Product; pricingLocked?: boolean }) {
  const { execMode, beginSave, endSave } = useExecMode();
  const [active, setActive] = useState(product.active ?? true);
  const [priceDraft, setPriceDraft] = useState(String(product.sizes[0]?.priceUsd ?? ""));
  const [stockDraft, setStockDraft] = useState("");

  async function patchProduct(patch: Record<string, unknown>) {
    beginSave();
    try {
      const res = await fetch(`/api/executive/products/${product.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save.");
      endSave(true);
    } catch {
      endSave(false);
    }
  }

  async function handleToggleActive() {
    const next = !active;
    setActive(next);
    await patchProduct({ active: next });
  }

  async function handlePriceBlur() {
    const value = Number(priceDraft);
    if (!Number.isFinite(value) || value < 0) return;
    const sizes = product.sizes.map((s, i) => (i === 0 ? { ...s, priceUsd: value } : s));
    await patchProduct({ sizes });
  }

  async function handleStockBlur() {
    if (!stockDraft.trim()) return;
    const value = Number(stockDraft);
    if (!Number.isFinite(value) || value < 0) return;
    await patchProduct({ initialStock: value });
  }

  return (
    <div className={`card-elevate flex flex-col overflow-hidden border bg-navy transition-colors duration-300 ${active ? "border-gold/20 hover:border-gold/60" : "border-hairline opacity-50"}`}>
      <Link href={`/shop/${product.slug}`} className="group flex flex-1 flex-col">
        {/* Image area, with the two badges pinned to its corners. */}
        <div className="relative">
          <ProductImage
            src={product.primaryImageUrl}
            name={product.name}
            zoom
            sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
          />
          <span className="pointer-events-none absolute left-3 top-3 border border-gold/40 bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-gold backdrop-blur-sm">
            {product.category}
          </span>
          <span
            className={`pointer-events-none absolute right-3 top-3 border px-2 py-1 text-[10px] uppercase tracking-[0.16em] backdrop-blur-sm ${
              active
                ? "border-gold/40 bg-black/70 text-white/80"
                : "border-white/25 bg-black/80 text-white/50"
            }`}
          >
            {active ? "In Stock" : "Unavailable"}
          </span>
        </div>

        {/* Info block. Deliberately dark against the light shell so the tile
            reads as one object and the image sits on a matching ground. */}
        <div className="flex flex-1 flex-col bg-navy p-5">
          <h3 className="font-serif text-lg leading-snug text-white">{product.name}</h3>
          <p className="mt-1 font-mono text-[11px] text-white/45">CAS {product.casNumber}</p>

          <div className="mt-4 flex items-baseline justify-between gap-3">
            {pricingLocked ? (
              <span className="text-[11px] uppercase tracking-[0.14em] text-white/60">Members&apos; pricing</span>
            ) : (
              <span className="text-sm text-white">{priceRange(product)}</span>
            )}
            <span className="text-[10px] uppercase tracking-[0.14em] text-gold">
              {product.purityPercent.toFixed(1)}% Purity
            </span>
          </div>

          {/* A span, not a button: the whole tile is already one link, and a
              nested interactive element would be invalid and unreachable. */}
          <span className="mt-4 block border border-gold/50 px-4 py-2.5 text-center text-[11px] uppercase tracking-[0.18em] text-gold transition-colors group-hover:bg-gold group-hover:text-black">
            {pricingLocked ? "Sign in to view" : "Select options"}
          </span>
        </div>
      </Link>
      {execMode && (
        <div className="space-y-2 border-t border-gold/30 bg-black/80 p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-gold/70">Quick Controls</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              onBlur={handlePriceBlur}
              placeholder="Price"
              className="border border-white/20 bg-black px-2 py-1 text-xs text-white focus:border-gold focus:outline-none"
            />
            <input
              type="number"
              min="0"
              value={stockDraft}
              onChange={(e) => setStockDraft(e.target.value)}
              onBlur={handleStockBlur}
              placeholder="Set stock"
              className="border border-white/20 bg-black px-2 py-1 text-xs text-white focus:border-gold focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleToggleActive}
            className="w-full border border-white/20 px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
          >
            {active ? "Hide from Shop" : "Show in Shop"}
          </button>
        </div>
      )}
    </div>
  );
}
