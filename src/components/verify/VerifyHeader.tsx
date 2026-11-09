"use client";

import Image from "next/image";
import { useEffect } from "react";
import { VerifySearch } from "./VerifySearch";

// The site-wide VERIFY BEFORE YOU BUY control (components/Header.tsx). One clickable element — the gray-and-gold
// emblem with the words — that opens the certificate search inline beneath the header row. No page change, no
// modal, no sign-in. Escape or Close shuts it; navigating elsewhere closes it too (Header keys it to the route).

export const VERIFY_PANEL_ID = "verify-before-you-buy";

export function VerifyButton({ open, onToggle, compact = false }: { open: boolean; onToggle: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={VERIFY_PANEL_ID}
      className={`group flex min-h-11 items-center gap-2 whitespace-nowrap text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
        compact ? "w-full justify-center py-1.5" : "px-1"
      }`}
    >
      {/* The gray-and-gold emblem, as supplied (public/VeriCert-Emblem-Gray-Gold.svg, viewBox 303 × 309). */}
      <Image src="/VeriCert-Emblem-Gray-Gold.svg" alt="" width={303} height={309} unoptimized className="h-7 w-auto shrink-0" />
      <span className={`text-[11px] uppercase tracking-[0.16em] transition-colors ${open ? "text-gold" : "text-white/80 group-hover:text-white"} sm:text-[12px]`}>
        Verify Before You Buy
      </span>
    </button>
  );
}

export function VerifyPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div id={VERIFY_PANEL_ID} className="border-t border-gold/20 bg-paper text-navy">
      <div className="mx-auto max-h-[calc(100dvh-8rem)] max-w-7xl overflow-y-auto px-4 py-5 sm:px-6 lg:px-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-ink">Verify before you buy</p>
          <button type="button" onClick={onClose} className="min-h-11 px-2 text-xs uppercase tracking-[0.14em] text-muted hover:text-navy">
            Close
          </button>
        </div>
        <VerifySearch autoFocus />
      </div>
    </div>
  );
}
