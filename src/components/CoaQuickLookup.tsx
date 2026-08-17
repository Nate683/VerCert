"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Batch-number lookup, placed where a customer will actually see it. Verifying
 * a certificate is the single most reassuring thing a first-time buyer can do,
 * so it sits on the homepage rather than behind a nav link.
 */
export function CoaQuickLookup({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [batch, setBatch] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = batch.trim();
    router.push(value ? `/coa?batch=${encodeURIComponent(value)}` : "/coa");
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? "flex gap-2" : "flex flex-col gap-3 sm:flex-row"}>
      <label htmlFor="coa-batch" className="sr-only">
        Batch number
      </label>
      <input
        id="coa-batch"
        type="text"
        value={batch}
        onChange={(e) => setBatch(e.target.value)}
        placeholder="Enter batch number — e.g. VC-BPC-2411"
        autoComplete="off"
        spellCheck={false}
        className="w-full border border-white/20 bg-black/40 px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 focus:border-gold focus:outline-none sm:flex-1"
      />
      <button
        type="submit"
        className="shrink-0 border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.18em] text-black transition-colors hover:bg-transparent hover:text-gold"
      >
        Verify
      </button>
    </form>
  );
}
