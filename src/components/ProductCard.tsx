"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { useExecMode } from "@/lib/exec-mode-context";
import { productImageAlt, productImageSources } from "@/lib/products/images";
import { formatPurity, specText } from "@/lib/products/specs";
import { pricedSizes } from "@/lib/products/pricing";
import { stockLabel } from "@/lib/products/stock";

// "from $40" hid the spread on products whose sizes differ by an order of
// magnitude. Show the range, and collapse to a single figure when there is
// only one size or every size costs the same. Null when nothing is priced:
// the tile then shows no price line at all.
function priceRange(product: Product): string | null {
  const prices = pricedSizes(product).map((s) => s.priceUsd);
  if (prices.length === 0) return null;
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

  async function patchProduct(patch: Record<string, unknown>): Promise<boolean> {
    beginSave();
    try {
      const res = await fetch(`/api/executive/products/${product.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save.");
      endSave(true);
      return true;
    } catch {
      endSave(false);
      return false;
    }
  }

  async function handleToggleActive() {
    const next = !active;
    setActive(next);
    // The server refuses to activate a product with no priced size.
    if (!(await patchProduct({ active: next }))) setActive(!next);
  }

  // Prices one size by label. The tile only carries the sizes on sale, so it
  // must not send a whole size list back — that would drop unpriced sizes.
  async function handlePriceBlur() {
    const value = Number(priceDraft);
    const first = product.sizes[0];
    if (!first || !priceDraft.trim() || !Number.isFinite(value) || value < 0) return;
    await patchProduct({ sizePrice: { label: first.label, priceUsd: value } });
  }

  async function handleStockBlur() {
    if (!stockDraft.trim()) return;
    const value = Number(stockDraft);
    if (!Number.isFinite(value) || value < 0) return;
    await patchProduct({ initialStock: value });
  }

  const cas = specText(product.casNumber);
  const purity = formatPurity(product.purityPercent);
  const price = pricingLocked ? null : priceRange(product);

  return (
    <div className={`card-elevate flex flex-col overflow-hidden border bg-navy transition-colors duration-300 ${active ? "border-gold/20 hover:border-gold/60" : "border-hairline opacity-50"}`}>
      <Link href={`/shop/${product.slug}`} className="group flex flex-1 flex-col">
        {/* Nothing is drawn over the image: badges there covered the vial cap. */}
        <ProductImage
          sources={productImageSources(product)}
          name={product.name}
          alt={productImageAlt(product)}
          zoom
          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
        />

        {/* Info block. Deliberately dark against the light shell so the tile
            reads as one object and the image sits on a matching ground. */}
        <div className="flex flex-1 flex-col border-t border-gold/15 bg-navy p-5">
          <div className="mb-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em]">
            {product.category ? <span className="truncate text-gold">{product.category}</span> : <span />}
            {/* Stock from the inventory table (withStock). Without it, say
                nothing rather than claim "In Stock". */}
            {!active ? (
              <span className="shrink-0 text-white/50">Unavailable</span>
            ) : product.stock ? (
              <span
                className={`shrink-0 ${
                  product.stock.status === "out"
                    ? "text-white/55"
                    : product.stock.status === "low"
                      ? "text-gold"
                      : "text-white/70"
                }`}
              >
                {stockLabel(product.stock)}
              </span>
            ) : null}
          </div>
          <h3 className="font-serif text-lg leading-snug text-white">{product.name}</h3>
          {cas && <p className="mt-1 font-mono text-[11px] text-white/45">CAS {cas}</p>}

          {(pricingLocked || price || purity) && (
            <div className="mt-4 flex items-baseline justify-between gap-3">
              {pricingLocked ? (
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/60">Members&apos; pricing</span>
              ) : (
                price && <span className="text-sm text-white">{price}</span>
              )}
              {purity && (
                <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-gold">{purity} Purity</span>
              )}
            </div>
          )}

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
