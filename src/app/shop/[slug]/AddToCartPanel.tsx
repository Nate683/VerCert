"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { resolveUnitPrice } from "@/lib/products";
import type { Product } from "@/lib/types";

export function AddToCartPanel({ product }: { product: Product }) {
  const router = useRouter();
  const [sizeIndex, setSizeIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

  const size = product.sizes[sizeIndex];
  const unitPrice = resolveUnitPrice(size, quantity);
  const listPrice = size.priceUsd;
  const lineTotal = unitPrice * quantity;
  const saving = (listPrice - unitPrice) * quantity;

  // The next bulk break, so the customer can see what one more unit is worth
  // rather than having to work it out from the tier table.
  const nextTier = (size.bulkTiers ?? [])
    .slice()
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .find((tier) => tier.minQuantity > quantity);

  function handleAdd() {
    addItem({
      slug: product.slug,
      name: product.name,
      sizeLabel: size.label,
      priceUsd: unitPrice,
      quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }

  return (
    <div className="border border-white/10 bg-white/[0.02] p-6">
      <fieldset>
        <legend className="text-xs uppercase tracking-[0.25em] text-gold">Size</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {product.sizes.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={i === sizeIndex}
              onClick={() => setSizeIndex(i)}
              className={`flex flex-col items-start border px-3 py-2 text-left transition-colors ${
                i === sizeIndex
                  ? "border-gold bg-gold/10"
                  : "border-white/15 hover:border-gold/60"
              }`}
            >
              <span className={`text-sm ${i === sizeIndex ? "text-gold" : "text-white"}`}>
                {s.label}
              </span>
              <span className="font-mono text-[11px] text-white/40">${s.priceUsd.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Price</p>
          <p className="mt-2 font-serif text-3xl text-white">
            ${unitPrice.toFixed(2)}
            <span className="ml-1 font-sans text-xs tracking-wide text-white/40">each</span>
          </p>
          {unitPrice !== listPrice && (
            <p className="font-mono text-xs text-white/40">
              <span className="line-through">${listPrice.toFixed(2)}</span>
              <span className="ml-2 text-gold">bulk price applied</span>
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="quantity"
            className="block text-xs uppercase tracking-[0.25em] text-gold"
          >
            Quantity
          </label>
          <div className="mt-2 flex items-center border border-white/15">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-2 text-white/70 transition-colors hover:text-gold"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <input
              id="quantity"
              type="number"
              min={1}
              max={999}
              value={quantity}
              onChange={(e) => {
                const next = Number(e.target.value);
                setQuantity(Number.isFinite(next) ? Math.min(999, Math.max(1, Math.floor(next))) : 1);
              }}
              className="w-14 border-x border-white/15 bg-transparent py-2 text-center text-sm text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(999, q + 1))}
              className="px-3 py-2 text-white/70 transition-colors hover:text-gold"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {nextTier && (
        <p className="mt-4 border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-white/70">
          Add {nextTier.minQuantity - quantity} more to pay ${nextTier.priceUsd.toFixed(2)} each.
        </p>
      )}

      <div className="mt-5 flex items-baseline justify-between border-t border-white/10 pt-4 text-sm">
        <span className="text-white/50">
          Total{quantity > 1 ? ` (${quantity} × $${unitPrice.toFixed(2)})` : ""}
        </span>
        <span className="font-mono text-lg text-white">${lineTotal.toFixed(2)}</span>
      </div>
      {saving > 0 && (
        <p className="mt-1 text-right text-xs text-gold">You save ${saving.toFixed(2)}</p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="mt-5 w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold"
      >
        {added ? "Added ✓" : "Add to Cart"}
      </button>

      {added && (
        <div className="pop-in mt-3 flex gap-3">
          <Link
            href="/cart"
            className="flex-1 border border-white/20 py-2.5 text-center text-xs uppercase tracking-[0.15em] text-white/80 transition-colors hover:border-gold hover:text-gold"
          >
            View Cart
          </Link>
          <button
            type="button"
            onClick={() => router.push("/checkout")}
            className="flex-1 border border-white/20 py-2.5 text-center text-xs uppercase tracking-[0.15em] text-white/80 transition-colors hover:border-gold hover:text-gold"
          >
            Checkout
          </button>
        </div>
      )}

      <ul className="mt-5 space-y-1.5 text-xs text-white/40">
        <li>Certificate of analysis included with every batch.</li>
        <li>Discreet packaging · Ships within 1–2 business days.</li>
        <li>
          <Link href="/shipping-policy" className="underline-offset-4 hover:text-gold hover:underline">
            Shipping
          </Link>
          {" · "}
          <Link href="/refund-policy" className="underline-offset-4 hover:text-gold hover:underline">
            Returns
          </Link>
          {" · "}
          <Link href="/contact" className="underline-offset-4 hover:text-gold hover:underline">
            Contact
          </Link>
        </li>
      </ul>
    </div>
  );
}
