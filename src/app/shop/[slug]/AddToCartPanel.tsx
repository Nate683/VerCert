"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { pricedSizes, resolveUnitPrice } from "@/lib/products";
import type { Product } from "@/lib/types";
import type { BlendComponentInfo } from "@/lib/products/blend-components";
import { VialGlyph } from "@/components/VialGlyph";
import { intervalLabel, subscriptionUnitPrice } from "@/lib/subscriptions/rules";

export function AddToCartPanel({
  product,
  components = {},
  subscription = null,
}: {
  product: Product;
  components?: Record<string, BlendComponentInfo>;
  // Set only when subscribe-and-save is on and this product qualifies.
  subscription?: { discountPercent: number; intervalDays: number[] } | null;
}) {
  const router = useRouter();
  const [sizeIndex, setSizeIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  // 0 = one-time purchase; otherwise the chosen subscription interval.
  const [intervalDays, setIntervalDays] = useState(0);
  const { addItem } = useCart();

  // Stock from the inventory table. Out of stock can't be added (checkout
  // would refuse it), and the quantity can't exceed what's left.
  const stock = product.stock;
  const outOfStock = stock?.status === "out";
  const maxQuantity = stock ? Math.max(1, Math.min(999, stock.remaining)) : 999;

  const sizes = pricedSizes(product);
  const size = sizes[Math.min(sizeIndex, sizes.length - 1)];
  const tierPrice = resolveUnitPrice(size, quantity);
  const subscribing = Boolean(subscription && intervalDays);
  const unitPrice = subscribing ? subscriptionUnitPrice(tierPrice, subscription!.discountPercent) : tierPrice;
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
      ...(subscribing ? { subscription: { intervalDays } } : {}),
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }

  return (
    <div className="border border-hairline bg-surface p-6">
      {/* Size chips: each shows its size and price, and the chosen one is
          filled navy so it reads as selected at a glance. */}
      <div>
        <p id="size-label" className="text-xs uppercase tracking-[0.25em] text-gold-ink">
          Size
        </p>
        <div role="radiogroup" aria-labelledby="size-label" className="mt-3 flex flex-wrap gap-2">
          {sizes.map((s, i) => {
            const selected = i === sizeIndex;
            return (
              <button
                key={s.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSizeIndex(i)}
                className={`flex min-h-[52px] min-w-[96px] flex-col items-start justify-center border-2 px-4 py-2 text-left transition-colors ${
                  selected
                    ? "border-navy bg-navy text-white"
                    : "border-hairline bg-paper text-navy hover:border-navy/50"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {selected && (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-gold" fill="none" aria-hidden="true">
                      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {s.label}
                </span>
                <span className={`font-mono text-xs ${selected ? "text-white/80" : "text-muted"}`}>
                  ${s.priceUsd.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* A blend's vial holds several compounds: one card per compound, with
          its own photo and page where the catalog has them. */}
      {size.composition && size.composition.length > 0 && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.25em] text-gold-ink">In each {size.label} vial</p>
          <ul className={`mt-3 grid gap-3 ${size.composition.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
            {size.composition.map((c) => {
              const info = components[c.name] ?? {};
              const body = (
                <>
                  <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-navy">
                    {info.imageUrl ? (
                      <Image src={info.imageUrl} alt={c.name} fill sizes="160px" className="object-cover" />
                    ) : (
                      <VialGlyph className="h-1/2 w-1/2 text-gold/30" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-navy">{c.name}</p>
                    <p className="font-mono text-xs text-muted">{c.amount}</p>
                    {info.href && (
                      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-navy underline-offset-4 group-hover:underline">
                        View compound →
                      </p>
                    )}
                  </div>
                </>
              );
              return (
                <li key={c.name} className="border border-hairline bg-paper">
                  {info.href ? (
                    <Link href={info.href} className="group block transition-colors hover:bg-surface">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stock && (
        <p className={`mt-6 flex items-center gap-2 text-sm ${stock.status === "out" ? "text-muted" : "text-navy"}`}>
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              stock.status === "out" ? "bg-muted" : stock.status === "low" ? "bg-gold" : "bg-navy"
            }`}
          />
          {stock.status === "out"
            ? "Out of stock"
            : stock.status === "low"
              ? `Low stock: only ${stock.remaining} left`
              : "In stock"}
        </p>
      )}

      {/* Subscribe and save: single compounds only, when a discount is set. */}
      {subscription && !outOfStock && (
        <fieldset className="mt-6">
          <legend className="text-xs uppercase tracking-[0.25em] text-gold-ink">Purchase</legend>
          <div className="mt-3 space-y-2">
            <label
              className={`flex cursor-pointer items-center justify-between gap-3 border-2 bg-paper px-4 py-3 text-sm ${
                !subscribing ? "border-navy" : "border-hairline hover:border-navy/50"
              }`}
            >
              <span className="flex items-center gap-3 text-navy">
                <input
                  type="radio"
                  name="purchase-type"
                  checked={!subscribing}
                  onChange={() => setIntervalDays(0)}
                  className="h-4 w-4 accent-navy"
                />
                One-time purchase
              </span>
              <span className="font-mono text-navy">${tierPrice.toFixed(2)}</span>
            </label>
            <div
              className={`border-2 bg-paper px-4 py-3 text-sm ${
                subscribing ? "border-navy" : "border-hairline hover:border-navy/50"
              }`}
            >
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-3 text-navy">
                  <input
                    type="radio"
                    name="purchase-type"
                    checked={subscribing}
                    onChange={() => setIntervalDays(subscription.intervalDays[0])}
                    className="h-4 w-4 accent-navy"
                  />
                  Subscribe &amp; save {subscription.discountPercent}%
                </span>
                <span className="font-mono text-navy">
                  ${subscriptionUnitPrice(tierPrice, subscription.discountPercent).toFixed(2)}
                </span>
              </label>
              {subscribing && (
                <div className="mt-3 border-t border-hairline pl-7 pt-3">
                  <label className="flex flex-wrap items-center gap-2 text-sm text-navy">
                    Deliver
                    <select
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(Number(e.target.value))}
                      className="border border-hairline bg-paper px-2 py-1.5 text-sm text-navy"
                    >
                      {subscription.intervalDays.map((d) => (
                        <option key={d} value={d}>
                          {intervalLabel(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    This order now, then a new order {intervalLabel(intervalDays)} at{" "}
                    {subscription.discountPercent}% off. Each one is emailed to you with bank transfer
                    instructions and ships once paid. Nothing is charged automatically, and you can
                    cancel any time from your account.
                  </p>
                </div>
              )}
            </div>
          </div>
        </fieldset>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold-ink">Price</p>
          <p className="mt-2 font-serif text-3xl text-navy">
            ${unitPrice.toFixed(2)}
            <span className="ml-1 font-sans text-xs tracking-wide text-muted">each</span>
          </p>
          {unitPrice !== listPrice && (
            <p className="font-mono text-xs text-muted">
              <span className="line-through">${listPrice.toFixed(2)}</span>
              <span className="ml-2 text-gold-ink">
                {subscribing ? `subscription price${tierPrice !== listPrice ? " + bulk" : ""}` : "bulk price applied"}
              </span>
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="quantity"
            className="block text-xs uppercase tracking-[0.25em] text-gold-ink"
          >
            Quantity
          </label>
          <div className="mt-2 flex items-center border border-hairline">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-2 text-muted transition-colors hover:text-gold-ink"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <input
              id="quantity"
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(e) => {
                const next = Number(e.target.value);
                setQuantity(Number.isFinite(next) ? Math.min(maxQuantity, Math.max(1, Math.floor(next))) : 1);
              }}
              className="w-14 border-x border-hairline bg-transparent py-2 text-center text-sm text-navy focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
              disabled={quantity >= maxQuantity}
              className="px-3 py-2 text-muted transition-colors hover:text-gold-ink"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {nextTier && (
        <p className="mt-4 border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-muted">
          Add {nextTier.minQuantity - quantity} more to pay ${nextTier.priceUsd.toFixed(2)} each.
        </p>
      )}

      <div className="mt-5 flex items-baseline justify-between border-t border-hairline pt-4 text-sm">
        <span className="text-muted">
          Total{quantity > 1 ? ` (${quantity} × $${unitPrice.toFixed(2)})` : ""}
        </span>
        <span className="font-mono text-lg text-navy">${lineTotal.toFixed(2)}</span>
      </div>
      {saving > 0 && (
        <p className="mt-1 text-right text-xs text-gold-ink">You save ${saving.toFixed(2)}</p>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={outOfStock}
        className="mt-5 w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface disabled:text-muted"
      >
        {outOfStock ? "Out of Stock" : added ? "Added ✓" : subscribing ? "Subscribe & Add to Cart" : "Add to Cart"}
      </button>

      {added && (
        <div className="pop-in mt-3 flex gap-3">
          <Link
            href="/cart"
            className="flex-1 border border-hairline py-2.5 text-center text-xs uppercase tracking-[0.15em] text-navy transition-colors hover:border-gold hover:text-gold-ink"
          >
            View Cart
          </Link>
          <button
            type="button"
            onClick={() => router.push("/checkout")}
            className="flex-1 border border-hairline py-2.5 text-center text-xs uppercase tracking-[0.15em] text-navy transition-colors hover:border-gold hover:text-gold-ink"
          >
            Checkout
          </button>
        </div>
      )}

      <ul className="mt-5 space-y-1.5 text-xs text-muted">
        <li>Certificate of analysis included with every batch.</li>
        <li>Tracked shipping · Ships within 1–2 business days.</li>
        <li>
          <Link href="/shipping-policy" className="underline-offset-4 hover:text-gold-ink hover:underline">
            Shipping
          </Link>
          {" · "}
          <Link href="/refund-policy" className="underline-offset-4 hover:text-gold-ink hover:underline">
            Returns
          </Link>
          {" · "}
          <Link href="/contact" className="underline-offset-4 hover:text-gold-ink hover:underline">
            Contact
          </Link>
        </li>
      </ul>
    </div>
  );
}
