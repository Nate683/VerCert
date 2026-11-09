"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CornerWatermarks } from "@/components/CornerWatermarks";

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
    // Centred in the white area with the corner emblem watermarks (components/CornerWatermarks.tsx); the extra top
    // padding sits the content slightly lower for balance.
    <CornerWatermarks>
    <div className="mx-auto w-full max-w-md px-6 pt-20 pb-12 lg:px-10">
      {/* The full lockup, transparent vector, at the sign-in page's size. */}
      <Image
        src="/VeriCert-Peptides-Full-Color-RGB-V2.svg"
        alt="VeriCert Peptides"
        width={298}
        height={149}
        unoptimized
        priority
        className="mx-auto mb-6 block h-auto w-[196px]"
      />
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Orders</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">Check Order Status</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Enter your order reference code and the email address associated with your purchase to review its status. All
        VeriCert orders require a registered research account.
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
        <p className="text-xs leading-relaxed text-muted">
          Both must match the order to render its logistics history. Access is
          then held in this browser for 7 days.
        </p>
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
        Registered customers can also access their{" "}
        <Link href="/login?next=/account" className="text-gold-ink hover:underline">
          account dashboard
        </Link>{" "}
        to review order history and tracking information.
      </p>
    </div>
    </CornerWatermarks>
  );
}
