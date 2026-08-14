"use client";

import { useState } from "react";
import type { SavedAddress } from "@/lib/types";

export function AddressForm({ initialAddress }: { initialAddress?: SavedAddress }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/account/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.get("address"),
          city: form.get("city"),
          state: form.get("state"),
          postalCode: form.get("postalCode"),
          country: form.get("country"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save address.");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save address.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          name="address"
          type="text"
          defaultValue={initialAddress?.address}
          placeholder="Address"
          required
          className="input-field sm:col-span-2"
        />
        <input
          name="city"
          type="text"
          defaultValue={initialAddress?.city}
          placeholder="City"
          required
          className="input-field"
        />
        <input
          name="state"
          type="text"
          defaultValue={initialAddress?.state}
          placeholder="State / Province"
          required
          className="input-field"
        />
        <input
          name="postalCode"
          type="text"
          defaultValue={initialAddress?.postalCode}
          placeholder="Postal code"
          required
          className="input-field"
        />
        <input
          name="country"
          type="text"
          defaultValue={initialAddress?.country}
          placeholder="Country"
          required
          className="input-field"
        />
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {saved && <p className="text-sm text-gold">Address saved.</p>}
      <button
        type="submit"
        disabled={submitting}
        className="border border-white/15 px-6 py-2 text-xs uppercase tracking-[0.15em] text-white/80 transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
      >
        {submitting ? "Saving..." : "Save Address"}
      </button>
    </form>
  );
}
