"use client";

import { useState } from "react";
import Link from "next/link";

// Order status without signing in: the reference code plus the email the
// order was placed with open the order page in this browser for 7 days.
export function OrderStatusLookup({ initialReference }: { initialReference: string }) {
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      // A full navigation, not router.push: a visitor sent here from the order
      // link has that link's redirect in the client router cache, which would
      // send them straight back here.
      window.location.assign(`/order/${data.reference}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Orders</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">Check Order Status</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Enter the reference code from your confirmation email (it starts with
        VC-) and the email address you ordered with. You&apos;ll see the
        order&apos;s status, tracking and payment instructions. No account
        needed.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-xs uppercase tracking-[0.2em] text-muted">Reference code</span>
          <input
            required
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            placeholder="VC-XXXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus={!initialReference}
            className="input-field-light mt-1 font-mono"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-[0.2em] text-muted">Email address</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@lab.org"
            autoComplete="email"
            autoFocus={Boolean(initialReference)}
            className="input-field-light mt-1"
          />
        </label>
        {error && (
          <p role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
        >
          {submitting ? "Looking up…" : "View Order"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Have an account?{" "}
        <Link href="/login?next=/account" className="text-gold-ink hover:underline">
          Sign in
        </Link>{" "}
        to see all your orders.
      </p>
    </div>
  );
}
