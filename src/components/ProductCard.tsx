"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { useExecMode } from "@/lib/exec-mode-context";

export function ProductCard({ product }: { product: Product }) {
  const { execMode, beginSave, endSave } = useExecMode();
  const minPrice = Math.min(...product.sizes.map((s) => s.priceUsd));
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
    <div className={`card-elevate flex flex-col border bg-white/[0.02] transition-colors duration-300 ${active ? "border-gold/20 hover:border-gold/60" : "border-white/5 opacity-50"}`}>
      <Link href={`/shop/${product.slug}`} className="group flex flex-1 flex-col">
        <ProductImage src={product.primaryImageUrl} name={product.name} zoom sizes="(min-width: 1024px) 25vw, 50vw" />
        <div className="border-t border-gold/10 p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">
            {product.category}
          </p>
          <h3 className="underline-draw mt-2 font-serif text-xl text-white">{product.name}</h3>
          <p className="mt-1 font-mono text-xs text-white/40">CAS {product.casNumber}</p>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="purity-badge">{product.purityPercent.toFixed(1)}% Purity</span>
            <span className="text-white">from ${minPrice}</span>
          </div>
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
