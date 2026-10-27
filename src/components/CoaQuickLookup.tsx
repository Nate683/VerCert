"use client";

import Image from "next/image";
import { useState } from "react";
import { COA_LOOKUP_ENABLED, openCoaLookup } from "@/lib/coa-lookup";

/**
 * Lot-number lookup: the emblem, the lot-number input and a gold Verify button.
 * Every lookup on the site is this component, so they all submit to the one
 * handler in lib/coa-lookup.ts. It renders nothing while that handler's flag
 * is off.
 *
 * The emblem is public/icon.png, the best real asset available: there is no
 * clean standalone transparent emblem yet (the file has a pale box baked in
 * and the bottom of the V is cropped), so it sits on a white tile that reads
 * on light and dark grounds. Swap the src here when the export arrives.
 */
export function CoaQuickLookup({ tone = "light", id = "coa-batch" }: { tone?: "light" | "dark"; id?: string }) {
  const [batch, setBatch] = useState("");
  if (!COA_LOOKUP_ENABLED) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = batch.trim();
    if (value) openCoaLookup(value);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch">
      <div className="flex items-center gap-3 sm:contents">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-hairline bg-paper">
          <Image src="/icon.png" alt="VeriCert" width={40} height={40} className="h-10 w-10" />
        </span>
        <label htmlFor={id} className="sr-only">
          Lot number
        </label>
        <input
          id={id}
          type="text"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          placeholder="e.g. VC-BPC-2411"
          autoComplete="off"
          spellCheck={false}
          className={`w-full border px-4 py-3 font-mono text-sm focus:border-gold focus:outline-none sm:flex-1 ${
            tone === "dark"
              ? "border-white/30 bg-white/10 text-white placeholder:text-white/60"
              : "border-hairline bg-paper text-navy placeholder:text-muted/70"
          }`}
        />
      </div>
      <button
        type="submit"
        className="shrink-0 border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.18em] text-black transition-colors hover:bg-transparent hover:text-gold"
      >
        Verify
      </button>
    </form>
  );
}
