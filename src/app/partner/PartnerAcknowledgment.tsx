"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AcknowledgmentText } from "@/components/AcknowledgmentText";

// Shown in place of the partner dashboard until the affiliate's account has
// the registration acknowledgment on record. Accepting reloads the page, which
// then shows the dashboard (and, after a sign-in link, the set-password card).
export function PartnerAcknowledgment() {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/acknowledgment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgment: acknowledged }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold-ink">Partner Portal</p>
      <h1 className="mt-3 text-center font-serif text-3xl text-navy">One thing before you continue</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-muted">
        We now keep this acknowledgment on record for every partner. You&apos;ll only be asked once.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4 border border-hairline bg-surface p-5 sm:p-8">
        <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-muted">
          <input
            id="partner-acknowledgment"
            type="checkbox"
            required
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
          />
          <span>
            <AcknowledgmentText />
          </span>
        </label>
        {error && (
          <div role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
