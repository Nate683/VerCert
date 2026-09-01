"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart-context";
import { useCatalog } from "@/lib/use-catalog";
import { RecentlyViewed } from "@/components/RecentlyViewed";

export default function CartClient() {
  const { items, updateQuantity, removeItem, subtotal } = useCart();
  const { entries } = useCatalog();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24 lg:px-10">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Cart</p>
          <h1 className="mt-3 font-serif text-4xl text-navy">Your cart is empty</h1>
          <p className="mt-4 text-sm text-muted">
            Browse the catalog to add research compounds to your cart.
          </p>
          <Link
            href="/shop"
            className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold-ink transition-colors hover:bg-gold hover:text-black"
          >
            Shop the Collection
          </Link>
        </div>
        <RecentlyViewed className="mt-20" title="Pick Up Where You Left Off" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Cart</p>
      <h1 className="mt-3 font-serif text-4xl text-navy">Your Cart</h1>
      <p className="mt-2 text-sm text-muted">
        Saved to this browser — it will still be here if you come back later.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_340px]">
        <ul className="divide-y divide-hairline border-y border-hairline">
          {items.map((item) => {
            const entry = entries.find((e) => e.slug === item.slug);
            return (
              <li
                key={`${item.slug}-${item.sizeLabel}`}
                className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center"
              >
                <Link
                  href={`/shop/${item.slug}`}
                  className="relative h-20 w-20 shrink-0 overflow-hidden border border-hairline bg-surface"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {entry?.imageUrl && (
                    <Image src={entry.imageUrl} alt="" fill sizes="80px" className="object-cover" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/shop/${item.slug}`}
                    className="font-serif text-lg text-navy transition-colors hover:text-gold-ink"
                  >
                    {item.name}
                  </Link>
                  <p className="mt-1 text-xs uppercase tracking-[0.15em] text-muted">
                    {item.sizeLabel}
                    {entry && ` · ${entry.purityPercent.toFixed(1)}% purity`}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    ${item.priceUsd.toFixed(2)} each
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <div className="flex items-center border border-hairline">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.slug, item.sizeLabel, item.quantity - 1)}
                      className="px-3 py-2 text-muted transition-colors hover:text-gold-ink"
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      −
                    </button>
                    <span className="w-10 text-center font-mono text-sm text-navy">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.slug, item.sizeLabel, item.quantity + 1)}
                      className="px-3 py-2 text-muted transition-colors hover:text-gold-ink"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      +
                    </button>
                  </div>

                  <span className="w-20 shrink-0 text-right font-mono text-sm text-navy">
                    ${(item.priceUsd * item.quantity).toFixed(2)}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeItem(item.slug, item.sizeLabel)}
                    className="text-xs uppercase tracking-[0.15em] text-muted transition-colors hover:text-gold-ink"
                  >
                    Remove
                    <span className="sr-only"> {item.name}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border border-hairline p-6">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Summary</h2>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="font-mono text-navy">${subtotal.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted">Shipping</span>
              <span className="text-muted">Calculated at checkout</span>
            </div>
            <p className="mt-4 text-xs text-muted">
              Promo codes are applied on the next step.
            </p>

            <Link
              href="/checkout"
              className="mt-6 block w-full border border-gold bg-gold py-3 text-center text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink"
            >
              Proceed to Checkout
            </Link>
            <Link
              href="/shop"
              className="mt-3 block w-full border border-hairline py-2.5 text-center text-xs uppercase tracking-[0.15em] text-muted transition-colors hover:border-gold hover:text-gold-ink"
            >
              Continue Shopping
            </Link>
          </div>

          <ul className="mt-5 space-y-2 text-xs text-muted">
            <li>Certificate of analysis included with every batch.</li>
            <li>Discreet packaging · ships within 1–2 business days.</li>
            <li>
              Questions?{" "}
              <Link href="/contact" className="underline-offset-4 hover:text-gold-ink hover:underline">
                Contact us
              </Link>
              .
            </li>
          </ul>
        </aside>
      </div>

      <RecentlyViewed className="mt-20" />
    </div>
  );
}
