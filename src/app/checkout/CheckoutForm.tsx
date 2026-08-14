"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import type { PaymentMethod, SavedAddress } from "@/lib/types";

const PAYMENT_OPTIONS: { value: PaymentMethod; title: string; body: string }[] = [
  {
    value: "crypto",
    title: "Cryptocurrency",
    body: "Pay with BTC, ETH, or USDC. You'll receive a deposit address, QR code, and a time-limited payment window.",
  },
  {
    value: "bank_transfer",
    title: "Bank Transfer",
    body: "Pay by ACH or wire. We'll email you our bank details and a unique reference — your order ships once funds clear.",
  },
];

export function CheckoutForm({
  initialEmail,
  initialAddress,
}: {
  initialEmail: string;
  initialAddress?: SavedAddress;
}) {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const [method, setMethod] = useState<PaymentMethod>("crypto");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agreed || submitting) return;

    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const customer = {
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      email: String(form.get("email") ?? ""),
      address: String(form.get("address") ?? ""),
      city: String(form.get("city") ?? ""),
      state: String(form.get("state") ?? ""),
      postalCode: String(form.get("postalCode") ?? ""),
      country: String(form.get("country") ?? ""),
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          paymentMethod: method,
          items: items.map((item) => ({
            slug: item.slug,
            sizeLabel: item.sizeLabel,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong placing your order.");
      }

      clearCart();
      router.push(`/order/${data.reference}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong placing your order.");
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center lg:px-10">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Checkout</p>
        <h1 className="mt-3 font-serif text-4xl text-white">Your cart is empty</h1>
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
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Checkout</p>
      <h1 className="mt-3 font-serif text-4xl text-white">Complete Your Order</h1>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <form onSubmit={handleSubmit} className="space-y-8 lg:col-span-2">
          <section>
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Contact</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input required name="email" type="email" defaultValue={initialEmail} placeholder="Email address" className="input-field sm:col-span-2" />
              <input required name="firstName" type="text" placeholder="First name" className="input-field" />
              <input required name="lastName" type="text" placeholder="Last name" className="input-field" />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Shipping Address</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input required name="address" type="text" defaultValue={initialAddress?.address} placeholder="Address" className="input-field sm:col-span-2" />
              <input required name="city" type="text" defaultValue={initialAddress?.city} placeholder="City" className="input-field" />
              <input required name="state" type="text" defaultValue={initialAddress?.state} placeholder="State / Province" className="input-field" />
              <input required name="postalCode" type="text" defaultValue={initialAddress?.postalCode} placeholder="Postal code" className="input-field" />
              <input required name="country" type="text" defaultValue={initialAddress?.country} placeholder="Country" className="input-field" />
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Payment Method</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PAYMENT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer border p-5 transition-colors ${
                    method === option.value
                      ? "border-gold bg-gold/5"
                      : "border-white/15 hover:border-white/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={option.value}
                    checked={method === option.value}
                    onChange={() => setMethod(option.value)}
                    className="sr-only"
                  />
                  <span className="flex items-center justify-between">
                    <span className="font-serif text-lg text-white">{option.title}</span>
                    <span
                      className={`h-3 w-3 rounded-full border ${
                        method === option.value ? "border-gold bg-gold" : "border-white/30"
                      }`}
                    />
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-white/50">
                    {option.body}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <label className="flex items-start gap-3 border border-white/10 p-4 text-sm text-white/60">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              required
              className="mt-1 h-4 w-4 accent-[#c9a227]"
            />
            I certify that I am purchasing these products strictly for
            laboratory research purposes, and not for human or veterinary
            consumption.
          </label>

          {error && (
            <p className="border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!agreed || submitting}
            className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gold disabled:hover:text-black"
          >
            {submitting ? "Placing Order..." : "Place Order"}
          </button>
        </form>

        <aside className="border border-white/10 p-6">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Order Summary</h2>
          <ul className="mt-4 space-y-4">
            {items.map((item) => (
              <li key={`${item.slug}-${item.sizeLabel}`} className="flex justify-between text-sm">
                <div>
                  <p className="text-white">{item.name}</p>
                  <p className="text-xs text-white/40">{item.sizeLabel} × {item.quantity}</p>
                </div>
                <span className="text-white">${(item.priceUsd * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-between border-t border-white/10 pt-4 text-sm">
            <span className="text-white/60">Subtotal</span>
            <span className="text-white">${subtotal.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-white/60">Shipping</span>
            <span className="text-white/60">Calculated at next step</span>
          </div>
          <div className="mt-4 flex justify-between border-t border-white/10 pt-4 font-serif text-lg">
            <span className="text-white">Total</span>
            <span className="text-gold">${subtotal.toFixed(2)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
