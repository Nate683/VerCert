"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";

export default function CartClient() {
  const { items, updateQuantity, removeItem, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center lg:px-10">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Cart</p>
        <h1 className="mt-3 font-serif text-4xl text-white">Your cart is empty</h1>
        <p className="mt-4 text-sm text-white/50">
          Browse the catalog to add research compounds to your cart.
        </p>
        <Link
          href="/shop"
          className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
        >
          Shop the Collection
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Cart</p>
      <h1 className="mt-3 font-serif text-4xl text-white">Your Cart</h1>

      <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
        {items.map((item) => (
          <div
            key={`${item.slug}-${item.sizeLabel}`}
            className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <Link
                href={`/shop/${item.slug}`}
                className="font-serif text-lg text-white hover:text-gold"
              >
                {item.name}
              </Link>
              <p className="mt-1 text-xs uppercase tracking-[0.15em] text-white/40">
                {item.sizeLabel}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center border border-white/15">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.slug, item.sizeLabel, item.quantity - 1)}
                  className="px-3 py-2 text-white/70 hover:text-gold"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-10 text-center text-sm text-white">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.slug, item.sizeLabel, item.quantity + 1)}
                  className="px-3 py-2 text-white/70 hover:text-gold"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <span className="w-20 text-right text-sm text-white">
                ${(item.priceUsd * item.quantity).toFixed(2)}
              </span>

              <button
                type="button"
                onClick={() => removeItem(item.slug, item.sizeLabel)}
                className="text-xs uppercase tracking-[0.15em] text-white/40 hover:text-gold"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-end gap-4">
        <div className="flex w-full max-w-xs justify-between border-b border-white/10 pb-4 text-sm text-white/60 sm:max-w-xs">
          <span>Subtotal</span>
          <span className="text-white">${subtotal.toFixed(2)}</span>
        </div>
        <Link
          href="/checkout"
          className="w-full max-w-xs border border-gold bg-gold py-3 text-center text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold"
        >
          Proceed to Checkout
        </Link>
      </div>
    </div>
  );
}
