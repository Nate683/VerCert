"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import type { Product } from "@/lib/types";

export function AddToCartPanel({ product }: { product: Product }) {
  const [sizeIndex, setSizeIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

  const size = product.sizes[sizeIndex];

  function handleAdd() {
    addItem({
      slug: product.slug,
      name: product.name,
      sizeLabel: size.label,
      priceUsd: size.priceUsd,
      quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="border border-white/10 p-6">
      <p className="text-xs uppercase tracking-[0.25em] text-gold">Size</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {product.sizes.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setSizeIndex(i)}
            className={`border px-4 py-2 text-sm transition-colors ${
              i === sizeIndex
                ? "border-gold bg-gold text-black"
                : "border-white/15 text-white/70 hover:border-gold hover:text-gold"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Price</p>
          <p className="mt-2 font-serif text-3xl text-white">${size.priceUsd.toFixed(2)}</p>
        </div>
        <div className="flex items-center border border-white/15">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-white/70 hover:text-gold"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-10 text-center text-sm text-white">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="px-3 py-2 text-white/70 hover:text-gold"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-6 w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold"
      >
        {added ? "Added to Cart" : "Add to Cart"}
      </button>

      <Link
        href={`/coa?batch=${product.batchNumbers[0]}`}
        className="mt-4 block text-center text-xs uppercase tracking-[0.2em] text-white/50 underline-offset-4 hover:text-gold hover:underline"
      >
        View Certificate of Analysis
      </Link>
    </div>
  );
}
