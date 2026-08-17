"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { track } from "@/lib/track-client";
import type { PaymentMethod, SavedAddress } from "@/lib/types";

const PAYMENT_OPTIONS: { value: PaymentMethod; title: string; oneLiner: string; detail: string }[] = [
  {
    value: "crypto",
    title: "Cryptocurrency",
    oneLiner: "Fastest — confirmed in minutes.",
    detail: "BTC, ETH or USDC. You get a deposit address and QR code on the next screen.",
  },
  {
    value: "bank_transfer",
    title: "Bank Transfer",
    oneLiner: "ACH or wire — ships once funds clear.",
    detail: "We email our bank details and a reference number for you to quote.",
  },
];

type Field = {
  name: keyof FormValues;
  label: string;
  autoComplete: string;
  type?: string;
  span?: boolean;
  inputMode?: "text" | "email" | "numeric";
};

type FormValues = {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const CONTACT_FIELDS: Field[] = [
  { name: "email", label: "Email address", autoComplete: "email", type: "email", span: true, inputMode: "email" },
  { name: "firstName", label: "First name", autoComplete: "given-name" },
  { name: "lastName", label: "Last name", autoComplete: "family-name" },
];

const ADDRESS_FIELDS: Field[] = [
  { name: "address", label: "Street address", autoComplete: "shipping street-address", span: true },
  { name: "city", label: "City", autoComplete: "shipping address-level2" },
  { name: "state", label: "State / Province", autoComplete: "shipping address-level1" },
  { name: "postalCode", label: "Postal code", autoComplete: "shipping postal-code" },
  { name: "country", label: "Country", autoComplete: "shipping country-name" },
];

export function CheckoutForm({
  initialEmail,
  initialAddress,
  bankTransferAvailable,
}: {
  initialEmail: string;
  initialAddress?: SavedAddress;
  bankTransferAvailable: boolean;
}) {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const paymentOptions = PAYMENT_OPTIONS.filter(
    (o) => o.value !== "bank_transfer" || bankTransferAvailable
  );

  const [values, setValues] = useState<FormValues>({
    email: initialEmail,
    firstName: "",
    lastName: "",
    address: initialAddress?.address ?? "",
    city: initialAddress?.city ?? "",
    state: initialAddress?.state ?? "",
    postalCode: initialAddress?.postalCode ?? "",
    country: initialAddress?.country ?? "",
  });
  // A returning customer sees their saved address as a summary line rather
  // than five pre-filled boxes to scroll past.
  const [editingAddress, setEditingAddress] = useState(!initialAddress);
  const [method, setMethod] = useState<PaymentMethod>("crypto");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  const [promoInput, setPromoInput] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountAmount: number;
    freeShipping: boolean;
  } | null>(null);

  useEffect(() => {
    if (items.length > 0) track("checkout_started");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount, not on every cart change
  }, []);

  const discountAmount = appliedPromo?.discountAmount ?? 0;
  const total = Math.max(0, subtotal - discountAmount);

  const detailsComplete = useMemo(
    () =>
      (Object.keys(values) as (keyof FormValues)[]).every((key) => values[key].trim().length > 0) &&
      values.email.includes("@"),
    [values]
  );
  // Three markers, one page: what's done, what's next, what's left.
  const step = !detailsComplete ? 0 : !agreed ? 1 : 2;

  function set(name: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  async function handleApplyPromo() {
    if (!promoInput.trim() || promoChecking) return;
    setPromoChecking(true);
    setPromoError(null);
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoInput.trim(),
          items: items.map((item) => ({
            slug: item.slug,
            sizeLabel: item.sizeLabel,
            quantity: item.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setAppliedPromo(null);
        setPromoError(data.message ?? data.error ?? "That code isn't valid for this order.");
        return;
      }
      setAppliedPromo({
        code: data.code,
        discountAmount: data.discountAmount,
        freeShipping: data.freeShipping,
      });
    } catch {
      setPromoError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPromoChecking(false);
    }
  }

  function handleRemovePromo() {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError(null);
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormValues, string>> = {};
    for (const field of [...CONTACT_FIELDS, ...ADDRESS_FIELDS]) {
      if (!values[field.name].trim()) errors[field.name] = `${field.label} is required.`;
    }
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      errors.email = "Enter a valid email address — this is where your order confirmation goes.";
    }
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      if (ADDRESS_FIELDS.some((f) => f.name === first)) setEditingAddress(true);
      // Let the address section render before trying to focus into it.
      requestAnimationFrame(() => {
        document.getElementById(`checkout-${first}`)?.focus();
      });
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!validate()) return;
    if (!agreed) {
      setError("Please confirm the research-use statement before placing your order.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            email: values.email.trim(),
            address: values.address.trim(),
            city: values.city.trim(),
            state: values.state.trim(),
            postalCode: values.postalCode.trim(),
            country: values.country.trim(),
          },
          paymentMethod: method,
          promoCode: appliedPromo?.code,
          items: items.map((item) => ({
            slug: item.slug,
            sizeLabel: item.sizeLabel,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        // The order may already exist even when payment setup failed — send
        // the customer to it rather than stranding them on the form.
        if (data.reference) {
          clearCart();
          router.push(`/order/${data.reference}`);
          return;
        }
        throw new Error(data.error ?? "Something went wrong placing your order.");
      }

      clearCart();
      track("order_completed", { reference: data.reference });
      router.push(`/order/${data.reference}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong placing your order. Please try again."
      );
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center lg:px-10">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Checkout</p>
        <h1 className="mt-3 font-serif text-4xl text-white">Your cart is empty</h1>
        <p className="mt-4 text-sm text-white/50">
          Add a compound to your cart and it will be waiting here.
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
    <div className="mx-auto max-w-6xl px-6 py-14 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Checkout</p>
      <h1 className="mt-3 font-serif text-4xl text-white">Complete Your Order</h1>

      <ProgressBar step={step} />

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} noValidate className="space-y-10">
          <section aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="text-xs uppercase tracking-[0.25em] text-gold">
              1 · Contact
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {CONTACT_FIELDS.map((field) => (
                <TextField
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  error={fieldErrors[field.name]}
                  onChange={(v) => set(field.name, v)}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="shipping-heading">
            <div className="flex items-center justify-between">
              <h2 id="shipping-heading" className="text-xs uppercase tracking-[0.25em] text-gold">
                2 · Shipping Address
              </h2>
              {initialAddress && !editingAddress && (
                <button
                  type="button"
                  onClick={() => setEditingAddress(true)}
                  className="text-xs uppercase tracking-[0.12em] text-white/50 underline-offset-4 transition-colors hover:text-gold hover:underline"
                >
                  Use a different address
                </button>
              )}
            </div>

            {!editingAddress && initialAddress ? (
              <div className="mt-4 flex items-start justify-between gap-4 border border-gold/25 bg-gold/[0.04] p-4">
                <div className="text-sm leading-relaxed text-white/70">
                  <p className="text-xs uppercase tracking-[0.15em] text-gold">Saved address</p>
                  <p className="mt-2 text-white">{values.address}</p>
                  <p>
                    {values.city}, {values.state} {values.postalCode}
                  </p>
                  <p>{values.country}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAddress(true)}
                  className="shrink-0 border border-white/20 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-white/70 transition-colors hover:border-gold hover:text-gold"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ADDRESS_FIELDS.map((field) => (
                  <TextField
                    key={field.name}
                    field={field}
                    value={values[field.name]}
                    error={fieldErrors[field.name]}
                    onChange={(v) => set(field.name, v)}
                  />
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-white/35">
              We&apos;ll save this address so your next order is one step shorter.
            </p>
          </section>

          <section aria-labelledby="payment-heading">
            <h2 id="payment-heading" className="text-xs uppercase tracking-[0.25em] text-gold">
              3 · Payment Method
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {paymentOptions.map((option) => (
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
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-serif text-lg text-white">{option.title}</span>
                    <span
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                        method === option.value ? "border-gold bg-gold" : "border-white/30"
                      }`}
                    />
                  </span>
                  <span className="mt-1.5 block text-sm text-gold">{option.oneLiner}</span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-white/50">
                    {option.detail}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 border border-white/10 p-4 text-sm leading-relaxed text-white/60">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#c9a227]"
              />
              I certify that I am purchasing these products strictly for
              laboratory research purposes, and not for human or veterinary
              consumption.
            </label>

            {error && (
              <p role="alert" className="border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full border border-gold bg-gold py-3.5 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gold disabled:hover:text-black"
            >
              {submitting ? "Placing order…" : `Place Order · $${total.toFixed(2)}`}
            </button>
            <p className="text-center text-xs text-white/35">
              No charge is taken until you complete payment on the next screen.
            </p>
          </div>
        </form>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border border-white/10 p-6">
            <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Order Summary</h2>
            <ul className="mt-4 space-y-4">
              {items.map((item) => (
                <li key={`${item.slug}-${item.sizeLabel}`} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-white">{item.name}</p>
                    <p className="text-xs text-white/40">
                      {item.sizeLabel} × {item.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-white">
                    ${(item.priceUsd * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 border-t border-white/10 pt-4">
              <label htmlFor="promo" className="text-xs uppercase tracking-[0.2em] text-gold">
                Promo Code
              </label>
              {appliedPromo ? (
                <div className="mt-3 flex items-center justify-between gap-2 border border-gold/40 bg-gold/5 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-white">
                    {appliedPromo.code}
                    {appliedPromo.freeShipping && " — free shipping"}
                  </span>
                  <button
                    type="button"
                    onClick={handleRemovePromo}
                    className="shrink-0 text-xs uppercase tracking-[0.1em] text-white/50 transition-colors hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input
                    id="promo"
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleApplyPromo();
                      }
                    }}
                    placeholder="Enter code"
                    className="input-field flex-1 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    disabled={promoChecking || !promoInput.trim()}
                    className="border border-white/20 px-4 text-xs uppercase tracking-[0.1em] text-white/70 transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {promoChecking ? "…" : "Apply"}
                  </button>
                </div>
              )}
              {promoError && (
                <p role="alert" className="mt-2 text-xs text-red-300">
                  {promoError}
                </p>
              )}
            </div>

            <dl className="mt-6 space-y-2 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-white/60">Subtotal</dt>
                <dd className="font-mono text-white">${subtotal.toFixed(2)}</dd>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-white/60">Discount</dt>
                  <dd className="font-mono text-gold">−${discountAmount.toFixed(2)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-white/60">Shipping</dt>
                <dd className="text-white/60">
                  {appliedPromo?.freeShipping ? "Free" : "Calculated after payment"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-4 font-serif text-lg">
              <span className="text-white">Total</span>
              <span className="font-mono text-gold">${total.toFixed(2)}</span>
            </div>

            <Link
              href="/cart"
              className="mt-5 block text-center text-xs uppercase tracking-[0.12em] text-white/40 underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              Edit cart
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

const STEPS = ["Your details", "Payment method", "Place order"];

function ProgressBar({ step }: { step: number }) {
  return (
    <ol className="mt-8 flex gap-3" aria-label="Checkout progress">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "upcoming";
        return (
          <li key={label} className="flex-1">
            <div
              className={`h-0.5 w-full transition-colors duration-500 ${
                state === "upcoming" ? "bg-white/10" : "bg-gold"
              }`}
            />
            <p
              className={`mt-2 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                state === "current" ? "text-gold" : state === "done" ? "text-white/60" : "text-white/30"
              }`}
            >
              {state === "done" ? "✓ " : ""}
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function TextField({
  field,
  value,
  error,
  onChange,
}: {
  field: Field;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `checkout-${field.name}`;
  return (
    <div className={field.span ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="block text-xs uppercase tracking-[0.12em] text-white/50">
        {field.label}
      </label>
      <input
        id={id}
        name={field.name}
        type={field.type ?? "text"}
        inputMode={field.inputMode}
        autoComplete={field.autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1.5 w-full border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none ${
          error ? "border-red-500/60 focus:border-red-400" : "border-white/15 focus:border-gold"
        }`}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
